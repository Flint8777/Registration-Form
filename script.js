// 気仙沼星空観望会 予約システム - メインスクリプト

// アクセシビリティ管理クラス
class AccessibilityManager {
    static announcePageChange(stepNumber) {
        const announcer = document.getElementById('page-announcer');
        if (announcer) {
            announcer.textContent = `ステップ ${stepNumber} に移動しました`;
        }
    }

    static updateProgressBar(current, total) {
        const progressBar = document.querySelector('.step-indicator[role="progressbar"]');
        if (progressBar) {
            progressBar.setAttribute('aria-valuenow', current);
            progressBar.setAttribute('aria-valuetext', `${current} / ${total} ステップ完了`);
        }
    }

    static setFocusToElement(elementId) {
        setTimeout(() => {
            const element = document.getElementById(elementId);
            if (element) {
                element.focus();
            }
        }, 100);
    }

    static manageAriaHidden() {
        // aria-hidden要素のフォーカス管理
        const hiddenElements = document.querySelectorAll('[aria-hidden="true"]');
        hiddenElements.forEach(element => {
            const focusableElements = element.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            focusableElements.forEach(focusable => {
                focusable.setAttribute('tabindex', '-1');
            });
        });
    }
}

// 定数定義（DRY原則適用）
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbyCUOTuVJeFY83gKbzHscIK42XHm6BQClWBgeDWl1oE1AxUEKfwje3wqYwpK7LRZs88CQ/exec',
    STEPS: {
        BASIC_INFO: 1,
        WORKSHOP_DETAILS: 2,
        CONFIRMATION: 3,
        COMPLETION: 4
    },
    TIMEOUTS: {
        EMAIL_VALIDATION: 500,
        RESULT_DISPLAY: 5000,
        BACKGROUND_UPDATE: [50, 100, 200, 500, 1000]
    },
    SELECTORS: {
        FORM: '#reservation-form',
        RESULT: '#result',
        LOADING_OVERLAY: '#loading-overlay',
        LOADING: '#loading',
        NAVIGATION: '#navigation',
        BACK_BTN: '#back-btn',
        NEXT_BTN: '#next-btn',
        SUBMIT_BTN: '#submit-btn',
        EMAIL_INPUT: '#メールアドレス',
        EMAIL_VALIDATION: '#email-validation-message',
        PARTICIPANT_COUNT: '#ワークショップ参加人数',
        WORKSHOP_PART: '#予約する部',
        WORKSHOP_PARTICIPATION: '#ワークショップ参加',
        CONFIRMATION_CONTENT: '#confirmation-content'
    },
    CLASSES: {
        ACTIVE: 'active',
        COMPLETED: 'completed',
        SHOW: 'show',
        VISIBLE: 'visible',
        EMAIL_VALID: 'email-valid',
        EMAIL_INVALID: 'email-invalid',
        FOCUSED: 'focused'
    }
};

// グローバル変数
let currentStep = CONFIG.STEPS.BASIC_INFO;
let formData = {};
let workshopParts = [];

// UIエレメント（DOMContentLoaded後に初期化）
let elements = {};

// DOM要素取得のユーティリティ関数
function getElement(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        console.warn(`Element not found: ${selector}`);
    }
    return element;
}

// DOM要素の初期化
function initializeElements() {
    elements = {
        form: getElement(CONFIG.SELECTORS.FORM),
        result: getElement(CONFIG.SELECTORS.RESULT),
        loadingOverlay: getElement(CONFIG.SELECTORS.LOADING_OVERLAY),
        loading: getElement(CONFIG.SELECTORS.LOADING),
        navigation: getElement(CONFIG.SELECTORS.NAVIGATION),
        backBtn: getElement(CONFIG.SELECTORS.BACK_BTN),
        nextBtn: getElement(CONFIG.SELECTORS.NEXT_BTN),
        submitBtn: getElement(CONFIG.SELECTORS.SUBMIT_BTN),
        emailInput: getElement(CONFIG.SELECTORS.EMAIL_INPUT),
        emailValidation: getElement(CONFIG.SELECTORS.EMAIL_VALIDATION),
        participantCount: getElement(CONFIG.SELECTORS.PARTICIPANT_COUNT),
        workshopPart: getElement(CONFIG.SELECTORS.WORKSHOP_PART),
        workshopParticipation: getElement(CONFIG.SELECTORS.WORKSHOP_PARTICIPATION),
        confirmationContent: getElement(CONFIG.SELECTORS.CONFIRMATION_CONTENT)
    };
}

// ローディング状態の管理
function setLoading(isLoading) {
    if (isLoading) {
        elements.loadingOverlay?.classList.add(CONFIG.CLASSES.SHOW);
        if (elements.navigation) elements.navigation.style.pointerEvents = 'none';
        if (elements.loading) elements.loading.style.display = 'block';
    } else {
        elements.loadingOverlay?.classList.remove(CONFIG.CLASSES.SHOW);
        if (elements.navigation) elements.navigation.style.pointerEvents = 'auto';
        if (elements.loading) elements.loading.style.display = 'none';
    }
}

// 結果表示の管理
function showResult(message, isSuccess = true) {
    if (!elements.result) return;

    elements.result.textContent = message;
    elements.result.className = `result ${CONFIG.CLASSES.SHOW} ${isSuccess ? 'success' : 'error'}`;

    setTimeout(() => {
        elements.result.classList.remove(CONFIG.CLASSES.SHOW);
    }, CONFIG.TIMEOUTS.RESULT_DISPLAY);
}

// ユーティリティ関数：クラス操作
function toggleClasses(element, classesToRemove = [], classesToAdd = []) {
    if (!element) return;

    classesToRemove.forEach(cls => element.classList.remove(cls));
    classesToAdd.forEach(cls => element.classList.add(cls));
}

// メールアドレスバリデーションメッセージ表示
function showEmailValidation(input, isValid, message) {
    if (!elements.emailValidation || !input) return;

    // 既存のクラスをリセット
    toggleClasses(input, [CONFIG.CLASSES.EMAIL_VALID, CONFIG.CLASSES.EMAIL_INVALID]);
    toggleClasses(elements.emailValidation, [CONFIG.CLASSES.SHOW, 'valid', 'invalid']);

    if (message) {
        elements.emailValidation.textContent = message;

        const validationClass = isValid ? 'valid' : 'invalid';
        const inputClass = isValid ? CONFIG.CLASSES.EMAIL_VALID : CONFIG.CLASSES.EMAIL_INVALID;

        toggleClasses(input, [], [inputClass]);
        toggleClasses(elements.emailValidation, [], [validationClass]);

        setTimeout(() => {
            elements.emailValidation.classList.add(CONFIG.CLASSES.SHOW);
        }, 50);
    }
}

// メールアドレスバリデーション
function validateEmail(email) {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email);
}

// ステップ更新
function updateStep(step) {
    // アクセシビリティ管理
    AccessibilityManager.announcePageChange(step);
    AccessibilityManager.updateProgressBar(step, CONFIG.STEPS.COMPLETION);

    // ステップインジケーター更新
    for (let i = 1; i <= CONFIG.STEPS.COMPLETION; i++) {
        const stepElement = getElement(`#step-${i}`);
        const contentElement = getElement(`#content-${i}`);

        if (stepElement && contentElement) {
            toggleClasses(stepElement, [CONFIG.CLASSES.ACTIVE, CONFIG.CLASSES.COMPLETED]);
            toggleClasses(contentElement, [CONFIG.CLASSES.ACTIVE]);

            if (i < step) {
                stepElement.classList.add(CONFIG.CLASSES.COMPLETED);
                stepElement.removeAttribute('aria-current');
            } else if (i === step) {
                stepElement.classList.add(CONFIG.CLASSES.ACTIVE);
                stepElement.setAttribute('aria-current', 'step');
                contentElement.classList.add(CONFIG.CLASSES.ACTIVE);

                // アクティブなステップの最初のフォーカス可能要素にフォーカス
                const firstInput = contentElement.querySelector('input, select, textarea, button');
                if (firstInput) {
                    AccessibilityManager.setFocusToElement(firstInput.id || firstInput.name);
                }
            } else {
                stepElement.removeAttribute('aria-current');
            }
        }
    }

    // aria-hidden管理
    AccessibilityManager.manageAriaHidden();

    // ナビゲーションボタン更新
    updateNavigationButtons(step);
    currentStep = step;
}

// ナビゲーションボタンの表示制御
function updateNavigationButtons(step) {
    // 全ボタンを非表示にしてからリセット
    [elements.backBtn, elements.nextBtn, elements.submitBtn].forEach(btn => {
        if (btn) btn.classList.remove(CONFIG.CLASSES.VISIBLE);
    });

    // 戻るボタン
    if (step > CONFIG.STEPS.BASIC_INFO && elements.backBtn) {
        elements.backBtn.classList.add(CONFIG.CLASSES.VISIBLE);
    }

    if (step === CONFIG.STEPS.COMPLETION) {
        // 完了画面：ナビゲーションを非表示
        if (elements.navigation) elements.navigation.style.display = 'none';
    } else if (step === CONFIG.STEPS.CONFIRMATION) {
        // 確認画面：送信ボタンのみ
        if (elements.submitBtn) elements.submitBtn.classList.add(CONFIG.CLASSES.VISIBLE);
    } else {
        // 通常のステップ：次へボタン
        if (elements.nextBtn) elements.nextBtn.classList.add(CONFIG.CLASSES.VISIBLE);
    }
}

// 前のステップへ
function previousStep() {
    if (currentStep > CONFIG.STEPS.BASIC_INFO) {
        // ステップ3から戻る場合の分岐処理
        if (currentStep === CONFIG.STEPS.CONFIRMATION) {
            const workshopParticipation = formData[CONFIG.SELECTORS.WORKSHOP_PARTICIPATION.slice(1)] ||
                elements.workshopParticipation?.value;

            const targetStep = (workshopParticipation === '参加しない') ?
                CONFIG.STEPS.BASIC_INFO : CONFIG.STEPS.WORKSHOP_DETAILS;

            updateStep(targetStep);
            return;
        }

        // ステップ2から1に戻る場合、ワークショップ関連フィールドをリセット
        if (currentStep === CONFIG.STEPS.WORKSHOP_DETAILS) {
            if (elements.participantCount) elements.participantCount.value = '';
            if (elements.workshopPart) elements.workshopPart.value = '';
        }

        updateStep(currentStep - 1);
    }
}

// 次のステップへ
function nextStep() {
    if (validateCurrentStep()) {
        saveCurrentStepData();

        // ステップ1からの分岐処理
        if (currentStep === CONFIG.STEPS.BASIC_INFO) {
            const workshopParticipation = elements.workshopParticipation?.value;

            if (workshopParticipation === '参加しない') {
                updateStep(CONFIG.STEPS.CONFIRMATION);
                generateConfirmationContent();
                return;
            } else {
                loadWorkshopParts();
                return;
            }
        }

        // ステップ2から3への移行
        if (currentStep === CONFIG.STEPS.WORKSHOP_DETAILS) {
            updateStep(CONFIG.STEPS.CONFIRMATION);
            generateConfirmationContent();
            return;
        }

        updateStep(currentStep + 1);
    }
}

// 現在のステップのバリデーション
function validateCurrentStep() {
    const currentContent = document.getElementById(`content-${currentStep}`);
    const requiredFields = currentContent.querySelectorAll('[required]');

    for (let field of requiredFields) {
        if (!field.value.trim()) {
            field.focus();
            showResult(`${field.previousElementSibling.textContent.replace(/[👤📍📧🔬👥⏰]/g, '').trim()}を入力してください。`, false);
            return false;
        }

        // メールアドレスフィールドの特別なバリデーション
        if (field.type === 'email' && field.value.trim()) {
            if (!validateEmail(field.value.trim())) {
                field.focus();
                showResult('有効なメールアドレスを入力してください。', false);
                showEmailValidation(field, false, '❌ 無効なメールアドレス形式です');
                return false;
            }
        }
    }

    // ステップ2の追加バリデーション
    if (currentStep === 2) {
        const participantCount = document.getElementById('ワークショップ参加人数').value;
        const selectedPart = document.getElementById('予約する部').value;

        if (!participantCount || participantCount < 1) {
            showResult('ワークショップ参加人数を正しく入力してください。', false);
            return false;
        }

        if (!selectedPart) {
            showResult('予約する部を選択してください。', false);
            return false;
        }
    }

    return true;
}

// 現在のステップのデータを保存
function saveCurrentStepData() {
    const currentContent = document.getElementById(`content-${currentStep}`);
    const inputs = currentContent.querySelectorAll('input, select');

    inputs.forEach(input => {
        if (input.value) {
            formData[input.name] = input.value;
        }
    });
}

// ワークショップの部情報を取得
async function loadWorkshopParts() {
    try {
        setLoading(true);

        const response = await fetch(`${CONFIG.API_URL}?action=getParts`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        console.log('APIレスポンス全体:', data); // デバッグ用

        // APIレスポンスの成功/失敗を確認
        if (!data.success) {
            throw new Error(data.error || '部の情報取得に失敗しました');
        }

        workshopParts = data.data || [];

        console.log('取得した部の情報:', workshopParts); // デバッグ用
        console.log('部の数:', workshopParts.length); // デバッグ用

        // 初期状態で一度更新（参加人数0でも全部表示される）
        updatePartOptions();
        updateStep(CONFIG.STEPS.WORKSHOP_DETAILS);
        setLoading(false);

    } catch (error) {
        console.error('部の情報取得エラー:', error);
        showResult('部の情報を取得できませんでした。しばらく後にもう一度お試しください。', false);
        setLoading(false);
    }
}

// 参加人数に応じて部の選択肢を更新
function updatePartOptions() {
    if (!elements.workshopPart || !elements.participantCount) {
        console.log('updatePartOptions: 必要な要素が見つかりません');
        return;
    }

    const participantCount = parseInt(elements.participantCount.value) || 0;

    console.log('updatePartOptions: 参加人数:', participantCount, 'workshopParts:', workshopParts);

    // 既存のオプションをクリア（最初のdefaultオプション以外）
    while (elements.workshopPart.children.length > 1) {
        elements.workshopPart.removeChild(elements.workshopPart.lastChild);
    }

    if (workshopParts && workshopParts.length > 0) {
        let availablePartsCount = 0;

        workshopParts.forEach(part => {
            console.log(`部: ${part.name}, 残席: ${part.remaining}, 参加人数: ${participantCount}`);

            const option = document.createElement('option');
            option.value = part.name;

            // 参加人数が0の場合は全て表示、それ以外は残席数以上の場合のみ表示
            const canReserve = (participantCount === 0) || (part.remaining >= participantCount);

            if (canReserve && part.remaining > 0) {
                option.textContent = `${part.name} （残席: ${part.remaining}席）`;
                availablePartsCount++;
                elements.workshopPart.appendChild(option);
                console.log(`追加した部: ${part.name}`);
            } else if (canReserve && part.remaining === 0) {
                option.textContent = `${part.name} （満席）`;
                option.disabled = true;
                elements.workshopPart.appendChild(option);
                console.log(`満席の部を追加: ${part.name}`);
            } else {
                console.log(`除外した部: ${part.name} (残席${part.remaining} < 参加人数${participantCount})`);
            }
        });

        console.log(`利用可能な部の数: ${availablePartsCount}, 参加人数: ${participantCount}`);

        // 利用可能な部がない場合のメッセージ
        if (availablePartsCount === 0 && participantCount > 0) {
            const option = document.createElement('option');
            option.textContent = `${participantCount}人での予約可能な部がありません`;
            option.disabled = true;
            elements.workshopPart.appendChild(option);
            console.log('利用可能な部がありません');
        }
    } else {
        const option = document.createElement('option');
        option.textContent = '現在予約可能な部がありません';
        option.disabled = true;
        elements.workshopPart.appendChild(option);
        console.log('workshopPartsが空またはnull:', workshopParts);
    }

    // 現在選択されている部が利用できなくなった場合、選択をクリア
    const currentSelection = elements.workshopPart.value;
    const selectedPart = workshopParts.find(part => part.name === currentSelection);
    if (selectedPart && participantCount > selectedPart.remaining) {
        elements.workshopPart.value = '';
    }
}

// 確認画面のコンテンツ生成
function generateConfirmationContent() {
    if (!elements.confirmationContent) return;

    let content = `
        <div style="background: #f8f9fa; border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem;">
            <h4 style="margin-bottom: 1rem; color: #333;">📋 登録内容</h4>
            <div style="display: grid; gap: 0.5rem;">
                <div><strong>代表者氏名:</strong> ${formData['代表者氏名'] || ''}</div>
                <div><strong>来場地域:</strong> ${formData['来場地域'] || ''}</div>
                <div><strong>メールアドレス:</strong> ${formData['メールアドレス'] || ''}</div>
                <div><strong>ワークショップ参加:</strong> ${formData['ワークショップ参加'] || ''}</div>
    `;

    if (formData['ワークショップ参加'] === '参加する') {
        content += `
                <div><strong>ワークショップ参加人数:</strong> ${formData['ワークショップ参加人数'] || ''}人</div>
                <div><strong>予約する部:</strong> ${formData['予約する部'] || ''}</div>
        `;
    }

    content += `
            </div>
        </div>
        <div style="background: linear-gradient(135deg, #ffecd2, #fcb69f); border-radius: 12px; padding: 1rem; text-align: center; color: #8b4513; font-size: 0.9rem;">
            <strong>⚠️ 注意事項</strong><br>
            内容に間違いがないかご確認ください。登録後の変更は観望会メールアドレス（kanbokaidaisakusen@gmail.com）までお問い合わせください。
        </div>
    `;

    elements.confirmationContent.innerHTML = content;
}

// フォーム送信（iframeを使った送信）
async function submitForm() {
    try {
        setLoading(true);

        // FormDataを作成
        const formDataForSubmit = new FormData();
        Object.keys(formData).forEach(key => {
            formDataForSubmit.append(key, formData[key]);
        });

        // 隠しiframeを作成
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.name = 'submitFrame';
        document.body.appendChild(iframe);

        // 動的フォームを作成
        const submitForm = document.createElement('form');
        submitForm.method = 'POST';
        submitForm.action = CONFIG.API_URL;
        submitForm.target = 'submitFrame';

        // フォームデータを追加
        Object.keys(formData).forEach(key => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = formData[key];
            submitForm.appendChild(input);
        });

        document.body.appendChild(submitForm);

        // iframe読み込み完了時の処理
        iframe.onload = function () {
            setTimeout(() => {
                try {
                    // 成功と仮定してステップ4に移行
                    updateStep(CONFIG.STEPS.COMPLETION);
                    showResult('予約が正常に送信されました！', true);

                    // フォームとiframeを削除
                    document.body.removeChild(submitForm);
                    document.body.removeChild(iframe);

                    setLoading(false);
                } catch (error) {
                    console.error('送信完了処理エラー:', error);
                    setLoading(false);
                }
            }, 1000);
        };

        // フォーム送信
        submitForm.submit();

    } catch (error) {
        console.error('登録送信エラー:', error);
        showResult('登録の送信に失敗しました。もう一度お試しください。', false);
        setLoading(false);
    }
}

// フォームリセット（新しい予約開始）
function resetForm() {
    formData = {};
    elements.form?.reset();
    updateStep(CONFIG.STEPS.BASIC_INFO);
    if (elements.navigation) elements.navigation.style.display = 'flex';
}

// ワークショップ参加選択の変更監視
document.getElementById('ワークショップ参加').addEventListener('change', function () {
    const participationValue = this.value;
    if (participationValue === '参加しない') {
        // 観望会のみの場合、ワークショップ関連データをクリア
        delete formData['ワークショップ参加人数'];
        delete formData['予約する部'];
    }
});

// 入力フィールドのアニメーション
document.querySelectorAll('.form-control').forEach(input => {
    input.addEventListener('focus', function () {
        this.parentElement.classList.add('focused');
    });

    input.addEventListener('blur', function () {
        this.parentElement.classList.remove('focused');
    });
});

// iOS専用の軽量背景表示関数
function ensureBackgroundDisplay() {
    const body = document.body;
    const html = document.documentElement;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isMobile = window.innerWidth <= 768;

    if (isMobile || isIOS) {
        // iOS/モバイル用の軽量設定
        const lightBackgroundStyle = {
            'background-color': '#667eea',
            'background': '-webkit-gradient(linear, left top, right bottom, color-stop(0%, #667eea), color-stop(100%, #764ba2))',
            'background-attachment': 'scroll',
            'background-repeat': 'no-repeat',
            'background-size': 'cover',
            'min-height': '100vh',
            'height': 'auto'
        };

        // 重要度を最高にして適用
        Object.keys(lightBackgroundStyle).forEach(property => {
            body.style.setProperty(property, lightBackgroundStyle[property], 'important');
            html.style.setProperty(property, lightBackgroundStyle[property], 'important');
        });

        // iOS専用の追加設定
        if (isIOS) {
            body.style.setProperty('-webkit-overflow-scrolling', 'touch', 'important');
            body.style.setProperty('-webkit-backface-visibility', 'hidden', 'important');
            body.style.setProperty('transform', 'translateZ(0)', 'important');

            // htmlにも同じ背景を確実に設定
            html.style.setProperty('background-color', '#667eea', 'important');
            html.style.setProperty('height', '100%', 'important');
            html.style.setProperty('min-height', '100vh', 'important');

            // Safari用の特別設定
            if (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')) {
                document.documentElement.style.setProperty('background', '-webkit-gradient(linear, left top, right bottom, color-stop(0%, #667eea), color-stop(100%, #764ba2))', 'important');
            }
        }

        // パフォーマンス優先のため、モバイルでは星空を非表示
        const starElement = document.querySelector('body::before');
        if (starElement) {
            starElement.style.display = 'none';
        }
    }
}

// より頻繁に背景をチェック
function forceBackgroundUpdate() {
    ensureBackgroundDisplay();

    // タイマーでも定期的にチェック（iOS対応）
    setTimeout(ensureBackgroundDisplay, 100);
    setTimeout(ensureBackgroundDisplay, 500);
    setTimeout(ensureBackgroundDisplay, 1000);
}

// イベントリスナーの設定
function setupEventListeners() {
    // ナビゲーションボタンのイベント
    elements.backBtn?.addEventListener('click', previousStep);
    elements.nextBtn?.addEventListener('click', nextStep);
    elements.submitBtn?.addEventListener('click', submitForm);

    // 新規予約ボタン
    getElement('.new-reservation-btn')?.addEventListener('click', resetForm);

    // ワークショップ参加選択の変更監視
    elements.workshopParticipation?.addEventListener('change', function () {
        const participationValue = this.value;
        if (participationValue === '参加しない') {
            // 観望会のみの場合、ワークショップ関連データをクリア
            delete formData['ワークショップ参加人数'];
            delete formData['予約する部'];
        }
    });

    // 入力フィールドのアニメーション
    document.querySelectorAll('.form-control').forEach(input => {
        input.addEventListener('focus', function () {
            this.parentElement.classList.add(CONFIG.CLASSES.FOCUSED);
        });

        input.addEventListener('blur', function () {
            this.parentElement.classList.remove(CONFIG.CLASSES.FOCUSED);
        });
    });

    // メールアドレスのリアルタイムバリデーション
    setupEmailValidation();

    // ワークショップ参加人数の選択イベント
    elements.participantCount?.addEventListener('change', function () {
        console.log('参加人数が変更されました:', this.value);
        if (workshopParts && workshopParts.length > 0) {
            updatePartOptions();
        } else {
            console.log('workshopPartsが利用できません:', workshopParts);
        }
    });
}

// メールアドレスバリデーションの設定
function setupEmailValidation() {
    if (!elements.emailInput) return;

    let validationTimeout;

    elements.emailInput.addEventListener('input', function () {
        const email = this.value.trim();

        clearTimeout(validationTimeout);

        if (email === '') {
            showEmailValidation(this, true, '');
            return;
        }

        validationTimeout = setTimeout(() => {
            if (validateEmail(email)) {
                showEmailValidation(this, true, '✅ 有効なメールアドレスです');
            } else {
                showEmailValidation(this, false, '❌ 無効なメールアドレス形式です');
            }
        }, CONFIG.TIMEOUTS.EMAIL_VALIDATION);
    });

    elements.emailInput.addEventListener('blur', function () {
        const email = this.value.trim();
        if (email && !validateEmail(email)) {
            showEmailValidation(this, false, '❌ 正しいメールアドレスを入力してください');
        }
    });

    elements.emailInput.addEventListener('focus', function () {
        if (this.value.trim() === '') {
            showEmailValidation(this, true, '');
        }
    });
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    // UIエレメントを初期化
    initializeElements();

    // イベントリスナーを設定
    setupEventListeners();

    // ローディング状態を初期化（非表示に）
    setLoading(false);

    // アクセシビリティ管理を初期化
    AccessibilityManager.manageAriaHidden();

    updateStep(CONFIG.STEPS.BASIC_INFO);

    // 初回背景設定（最優先）
    forceBackgroundUpdate();

    // 画面回転・リサイズ時の処理
    window.addEventListener('orientationchange', () => {
        CONFIG.TIMEOUTS.BACKGROUND_UPDATE.forEach(delay => {
            setTimeout(forceBackgroundUpdate, delay);
        });
    });

    window.addEventListener('resize', () => {
        setTimeout(forceBackgroundUpdate, CONFIG.TIMEOUTS.BACKGROUND_UPDATE[0]);
    });

    // iOS用の追加イベント監視
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
        const iosEvents = ['visibilitychange', 'focus', 'scroll', 'touchstart'];

        iosEvents.forEach((event, index) => {
            const options = index >= 2 ? { once: true } : {};

            if (event === 'focus') {
                window.addEventListener(event, forceBackgroundUpdate, options);
            } else {
                document.addEventListener(event, forceBackgroundUpdate, options);
            }
        });
    }
});
