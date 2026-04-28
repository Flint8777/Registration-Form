// 気仙沼星空観望会 予約システム - メインスクリプト

// HTMLエスケープ（XSS対策）
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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
// API_URL は config.js で定義された SITE_CONFIG から読み込む（コミット禁止）
// 未設定のまま起動すると API 呼び出しが空 URL になるため、起動時に明示的に止める
if (typeof SITE_CONFIG === 'undefined' || !SITE_CONFIG.API_URL) {
    throw new Error('SITE_CONFIG.API_URL が未定義です。config.example.js を config.js にコピーして API_URL を設定してください。');
}
const CONFIG = {
    API_URL: SITE_CONFIG.API_URL,
    STEPS: {
        BASIC_INFO: 1,
        WORKSHOP_DETAILS: 2,
        PLANETARIUM_DETAILS: 3,
        COMPLETION: 4
    },
    TIMEOUTS: {
        EMAIL_VALIDATION: 500,
        RESULT_DISPLAY: 5000
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
        ATTENDANCE_COUNT: '#来場人数',
        PARTICIPANT_COUNT: '#ワークショップ参加人数',
        WORKSHOP_PART: '#予約する部',
        WORKSHOP_PARTICIPATION: '#ワークショップ参加',
        PLANETARIUM_INTENT: '#プラネタリウム鑑賞',
        PLANETARIUM_PARTICIPANT_COUNT: '#プラネタリウム参加人数',
        PLANETARIUM_PART: '#プラネタリウム予約部',
        TRANSPORT_MODE: '#当日の交通手段',
        CAR_COUNT_GROUP: '#car-count-group',
        CAR_COUNT: '#お車台数',
        EVENT_SOURCE: '#イベント認知経路',
        EMAIL_CONFIRM_INPUT: '#メールアドレス確認',
        EMAIL_CONFIRM_VALIDATION: '#email-confirm-validation-message',
        CONSENT_GROUP: '#consent-group',
        PRIVACY_CONSENT: '#privacy-consent',
        PRIVACY_POLICY_LINK: '#privacy-policy-link'
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
let planetariumParts = [];

// iframe閉じる共通関数
function closeIframe() {
    // iframe環境かどうかを確認
    if (window.self !== window.top) {
        // iframe内で実行されている場合
        try {
            // 親ウィンドウにメッセージを送信（iframe閉じる要求）
            window.parent.postMessage({ type: 'closeIframe' }, '*');
            console.log('親ウィンドウにiframe閉じる要求を送信しました');
        } catch (error) {
            console.error('親ウィンドウへの通信エラー:', error);
            // フォールバック：可能であれば親ウィンドウを操作
            try {
                window.parent.close();
            } catch (closeError) {
                console.error('ウィンドウクローズエラー:', closeError);
                alert('画面を手動で閉じてください');
            }
        }
    } else {
        // 通常のウィンドウで実行されている場合
        if (confirm('画面を閉じますか？')) {
            window.close();
        }
    }
}

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
        attendanceCount: getElement(CONFIG.SELECTORS.ATTENDANCE_COUNT),
        participantCount: getElement(CONFIG.SELECTORS.PARTICIPANT_COUNT),
        workshopPart: getElement(CONFIG.SELECTORS.WORKSHOP_PART),
        workshopParticipation: getElement(CONFIG.SELECTORS.WORKSHOP_PARTICIPATION),
        planetariumIntent: getElement(CONFIG.SELECTORS.PLANETARIUM_INTENT),
        planetariumParticipantCount: getElement(CONFIG.SELECTORS.PLANETARIUM_PARTICIPANT_COUNT),
        planetariumPart: getElement(CONFIG.SELECTORS.PLANETARIUM_PART),
        transportMode: getElement(CONFIG.SELECTORS.TRANSPORT_MODE),
        carCountGroup: getElement(CONFIG.SELECTORS.CAR_COUNT_GROUP),
        carCount: getElement(CONFIG.SELECTORS.CAR_COUNT),
        eventSource: getElement(CONFIG.SELECTORS.EVENT_SOURCE),
        emailConfirmInput: getElement(CONFIG.SELECTORS.EMAIL_CONFIRM_INPUT),
        emailConfirmValidation: getElement(CONFIG.SELECTORS.EMAIL_CONFIRM_VALIDATION),
        consentGroup: getElement(CONFIG.SELECTORS.CONSENT_GROUP),
        privacyConsent: getElement(CONFIG.SELECTORS.PRIVACY_CONSENT),
        privacyPolicyLink: getElement(CONFIG.SELECTORS.PRIVACY_POLICY_LINK)
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

// メールアドレス確認のバリデーション表示
function showEmailConfirmValidation(isValid, message) {
    if (!elements.emailConfirmValidation || !elements.emailConfirmInput) return;

    toggleClasses(elements.emailConfirmInput, [CONFIG.CLASSES.EMAIL_VALID, CONFIG.CLASSES.EMAIL_INVALID]);
    toggleClasses(elements.emailConfirmValidation, [CONFIG.CLASSES.SHOW, 'valid', 'invalid']);

    if (message) {
        elements.emailConfirmValidation.textContent = message;
        const validationClass = isValid ? 'valid' : 'invalid';
        const inputClass = isValid ? CONFIG.CLASSES.EMAIL_VALID : CONFIG.CLASSES.EMAIL_INVALID;
        toggleClasses(elements.emailConfirmInput, [], [inputClass]);
        toggleClasses(elements.emailConfirmValidation, [], [validationClass]);
        setTimeout(() => {
            elements.emailConfirmValidation.classList.add(CONFIG.CLASSES.SHOW);
        }, 50);
    }
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

    // Step 2に遷移する際はワークショップセクションを表示
    if (step === CONFIG.STEPS.WORKSHOP_DETAILS) {
        const workshopSection = document.getElementById('workshop-section');
        if (workshopSection) {
            workshopSection.classList.add('show');
            workshopSection.setAttribute('aria-hidden', 'false');
        }
    }

    // Step 3に遷移する際はプラネタリウムセクションを表示
    if (step === CONFIG.STEPS.PLANETARIUM_DETAILS) {
        const planetariumSection = document.getElementById('planetarium-section');
        if (planetariumSection) {
            planetariumSection.classList.add('show');
            planetariumSection.setAttribute('aria-hidden', 'false');
        }
    }

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
    // 同意チェックボックスを初期状態で非表示
    if (elements.consentGroup) elements.consentGroup.style.display = 'none';

    // 完了画面：ナビゲーションを非表示
    if (step === CONFIG.STEPS.COMPLETION) {
        if (elements.navigation) elements.navigation.style.display = 'none';
        return;
    }

    // 戻るボタン
    if (step > CONFIG.STEPS.BASIC_INFO && elements.backBtn) {
        elements.backBtn.classList.add(CONFIG.CLASSES.VISIBLE);
    }

    // Step 1では常に「次へ」ボタンを表示
    if (step === CONFIG.STEPS.BASIC_INFO) {
        if (elements.nextBtn) elements.nextBtn.classList.add(CONFIG.CLASSES.VISIBLE);
        return;
    }

    // Step 2以降で最終入力ステップを計算
    const workshopParticipation = formData['ワークショップ参加'] || elements.workshopParticipation?.value;
    const planetariumIntent = formData['プラネタリウム鑑賞'] || elements.planetariumIntent?.value;
    const lastDataStep = (workshopParticipation === 'はい')
        ? ((planetariumIntent === 'はい') ? CONFIG.STEPS.PLANETARIUM_DETAILS : CONFIG.STEPS.WORKSHOP_DETAILS)
        : ((planetariumIntent === 'はい') ? CONFIG.STEPS.PLANETARIUM_DETAILS : CONFIG.STEPS.BASIC_INFO);

    // 最終入力ステップでは送信ボタンと同意チェックボックスを表示、それ以外は次へ
    if (step === lastDataStep) {
        if (elements.submitBtn) elements.submitBtn.classList.add(CONFIG.CLASSES.VISIBLE);
        if (elements.consentGroup) elements.consentGroup.style.display = 'block';
    } else {
        if (elements.nextBtn) elements.nextBtn.classList.add(CONFIG.CLASSES.VISIBLE);
    }
}

// 前のステップへ
function previousStep() {
    if (currentStep <= CONFIG.STEPS.BASIC_INFO) return;

    if (currentStep === CONFIG.STEPS.PLANETARIUM_DETAILS) {
        const workshopParticipation = formData['ワークショップ参加'] || elements.workshopParticipation?.value;
        const target = (workshopParticipation === 'はい') ? CONFIG.STEPS.WORKSHOP_DETAILS : CONFIG.STEPS.BASIC_INFO;
        updateStep(target);
        return;
    }

    if (currentStep === CONFIG.STEPS.WORKSHOP_DETAILS) {
        updateStep(CONFIG.STEPS.BASIC_INFO);
        return;
    }

    updateStep(currentStep - 1);
}

// ボタンのローディング状態を設定
function setButtonLoading(button, isLoading, originalText = null) {
    if (!button) return;

    if (isLoading) {
        // ローディング状態を開始
        button.disabled = true;
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.textContent;
        }
        button.innerHTML = `
            <span class="spinner" style="width: 16px; height: 16px; margin-right: 8px; display: inline-block; vertical-align: middle;"></span>
            処理中...
        `;
        button.classList.add('loading');

        // 他のナビゲーションボタンも無効化（submitボタンの場合）
        if (button === elements.submitBtn) {
            if (elements.backBtn) elements.backBtn.disabled = true;
            if (elements.nextBtn) elements.nextBtn.disabled = true;
        }
    } else {
        // ローディング状態を終了
        button.disabled = false;
        button.textContent = originalText || button.dataset.originalText || '次へ →';
        button.classList.remove('loading');
        delete button.dataset.originalText;

        // 他のナビゲーションボタンも有効化（submitボタンの場合）
        if (button === elements.submitBtn) {
            if (elements.backBtn) elements.backBtn.disabled = false;
            if (elements.nextBtn) elements.nextBtn.disabled = false;
        }
    }
}

// 次のステップへ（ローディング機能付き）
async function nextStep() {
    if (!validateCurrentStep()) return;

    setButtonLoading(elements.nextBtn, true);

    try {
        saveCurrentStepData();

        if (currentStep === CONFIG.STEPS.BASIC_INFO) {
            const workshopParticipation = elements.workshopParticipation?.value;
            const planetariumIntent = elements.planetariumIntent?.value;

            console.log('Step 1からの遷移:', {
                workshop: workshopParticipation,
                planetarium: planetariumIntent
            });

            // 両方選択されている場合はワークショップから開始
            if (workshopParticipation === 'はい') {
                console.log('ワークショップStep 2へ遷移（プラネタリウム意向:', planetariumIntent, '）');
                await loadWorkshopParts(); // 内部でStep2へ遷移
                setButtonLoading(elements.nextBtn, false);
                return;
            }
            // ワークショップ不参加でプラネタリウムのみの場合
            if (planetariumIntent === 'はい') {
                console.log('プラネタリウムのみでStep 3へ遷移');
                await loadPlanetariumParts(); // プラネタリウム部情報取得
                updateStep(CONFIG.STEPS.PLANETARIUM_DETAILS);
                setButtonLoading(elements.nextBtn, false);
                return;
            }
            // どちらも不要なら送信（同意チェックを表示して確認）
            console.log('両方不要のため直接送信');
            setButtonLoading(elements.nextBtn, false);
            if (elements.consentGroup) elements.consentGroup.style.display = 'block';
            if (elements.privacyConsent && !elements.privacyConsent.checked) {
                // 次へボタンを隠し、送信ボタンを表示
                if (elements.nextBtn) elements.nextBtn.classList.remove(CONFIG.CLASSES.VISIBLE);
                if (elements.submitBtn) elements.submitBtn.classList.add(CONFIG.CLASSES.VISIBLE);
                showResult('個人情報の取り扱いへの同意が必要です。', false);
                return;
            }
            await submitForm();
            return;
        }

        if (currentStep === CONFIG.STEPS.WORKSHOP_DETAILS) {
            // Step 1で保存されたプラネタリウム意向を確認
            console.log('Step 2からの遷移チェック:', {
                formData: formData,
                planetariumFromFormData: formData['プラネタリウム鑑賞'],
                planetariumFromElement: elements.planetariumIntent?.value
            });

            const planetariumIntent = formData['プラネタリウム鑑賞'] || elements.planetariumIntent?.value;
            console.log('決定されたプラネタリウム意向:', planetariumIntent);

            if (planetariumIntent === 'はい') {
                console.log('プラネタリウムStep 3へ遷移');
                await loadPlanetariumParts(); // プラネタリウム部情報取得
                updateStep(CONFIG.STEPS.PLANETARIUM_DETAILS);
                setButtonLoading(elements.nextBtn, false);
                return;
            }
            console.log('プラネタリウム不要のため送信');
            setButtonLoading(elements.nextBtn, false);
            await submitForm();
            return;
        }

        if (currentStep === CONFIG.STEPS.PLANETARIUM_DETAILS) {
            setButtonLoading(elements.nextBtn, false);
            await submitForm();
            return;
        }

        // フォールバック
        setButtonLoading(elements.nextBtn, false);
        updateStep(currentStep + 1);

    } catch (error) {
        console.error('ステップ遷移エラー:', error);
        setButtonLoading(elements.nextBtn, false);
        showResult('処理中にエラーが発生しました。もう一度お試しください。', false);
    }
}

// 次のステップへ
function nextStep_old() {
    if (validateCurrentStep()) {
        saveCurrentStepData();

        // ステップ1からの分岐処理
        if (currentStep === CONFIG.STEPS.BASIC_INFO) {
            const workshopParticipation = elements.workshopParticipation?.value;

            if (workshopParticipation === 'いいえ') {
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
            showResult(`${field.previousElementSibling.textContent.replace(/[👤👥📍📧📱🛣🚗✂🪐⏰]/g, '').trim()}を入力してください。`, false);
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

    // ステップ1の追加バリデーション（メールアドレス一致確認）
    if (currentStep === CONFIG.STEPS.BASIC_INFO) {
        const email = elements.emailInput?.value?.trim() || '';
        const emailConfirm = elements.emailConfirmInput?.value?.trim() || '';
        if (email && emailConfirm && email !== emailConfirm) {
            elements.emailConfirmInput?.focus();
            showResult('メールアドレスが一致しません。', false);
            showEmailConfirmValidation(false, '❌ メールアドレスが一致しません');
            return false;
        }
    }

    // ステップ1の追加バリデーション（交通手段と車台数）
    if (currentStep === CONFIG.STEPS.BASIC_INFO) {
        const transport = elements.transportMode?.value || '';
        if (transport === '車') {
            const carCountValue = elements.carCount?.value?.trim();
            const carCountNum = parseInt(carCountValue, 10);
            if (!carCountValue || isNaN(carCountNum) || carCountNum < 1) {
                elements.carCount?.focus();
                showResult('お車の台数を1台以上で入力してください。', false);
                return false;
            }
        }
    }

    // ステップ2: ワークショップのみバリデーション
    if (currentStep === CONFIG.STEPS.WORKSHOP_DETAILS) {
        const workshopParticipation = elements.workshopParticipation?.value;
        if (workshopParticipation === 'はい') {
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
    }

    // ステップ3: プラネタリウムのバリデーション
    if (currentStep === CONFIG.STEPS.PLANETARIUM_DETAILS) {
        const planetariumIntent = elements.planetariumIntent?.value;
        if (planetariumIntent === 'はい') {
            const pCount = document.getElementById('プラネタリウム参加人数').value;
            const pPart = document.getElementById('プラネタリウム予約部').value;
            if (!pCount || pCount < 1) {
                showResult('プラネタリウム参加人数を選択してください。', false);
                return false;
            }
            const pNum = parseInt(pCount, 10);
            if (pNum > 30) {
                showResult('プラネタリウム参加人数は30人までです。', false);
                return false;
            }
            if (!pPart) {
                showResult('プラネタリウムの予約部を選択してください。', false);
                return false;
            }
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

    // ステップ1の条件付きデータ調整
    if (currentStep === CONFIG.STEPS.BASIC_INFO) {
        const transport = elements.transportMode?.value || '';
        formData['当日の交通手段'] = transport;
        if (transport === '車') {
            formData['お車台数'] = elements.carCount?.value?.trim() || '';
        } else {
            delete formData['お車台数'];
            if (elements.carCount) elements.carCount.value = '';
        }

        // プラネタリウム希望
        if (elements.planetariumIntent) {
            formData['プラネタリウム鑑賞'] = elements.planetariumIntent.value || '';
        }
    }

    // ステップ2の条件付きデータ調整
    if (currentStep === CONFIG.STEPS.WORKSHOP_DETAILS) {
        const planetariumIntent = elements.planetariumIntent?.value;
        if (planetariumIntent !== 'はい') {
            delete formData['プラネタリウム参加人数'];
            delete formData['プラネタリウム予約部'];
        }
        const workshopParticipation = elements.workshopParticipation?.value;
        if (workshopParticipation !== 'はい') {
            delete formData['ワークショップ参加人数'];
            delete formData['予約する部'];
        }
    }
}

// GAS の GET エンドポイントから JSON を取得する
// 旧実装は <script> タグ経由の JSONP でレスポンスを任意 JS として実行していた。
// GAS 側は応答時に Access-Control-Allow-Origin を付与しているため、通常の fetch で十分。
async function fetchJson(url, { timeoutMs = 15000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

// ワークショップの部情報を取得
async function loadWorkshopParts() {
    try {
        setLoading(true);

        // キャッシュ回避のためタイムスタンプを追加
        const timestamp = new Date().getTime();
        const apiUrl = `${CONFIG.API_URL}?action=getParts&t=${timestamp}`;
        const data = await fetchJson(apiUrl);

        if (!data.success) {
            throw new Error(data.error || '部の情報取得に失敗しました');
        }

        workshopParts = data.data || [];
        console.log('部の数:', workshopParts.length);

        // 初期状態で一度更新（参加人数0でも全部表示される）
        updatePartOptions();
        updateWorkshopParticipantOptions();
        updateStep(CONFIG.STEPS.WORKSHOP_DETAILS);
        setLoading(false);

    } catch (error) {
        console.error('部の情報取得エラー:', error);
        showResult('部の情報を取得できませんでした。しばらく後にもう一度お試しください。', false);
        setLoading(false);
    }
}

// プラネタリウムの部情報を取得
async function loadPlanetariumParts() {
    try {
        setLoading(true);

        const data = await fetchJson(`${CONFIG.API_URL}?action=getPlanetariumParts`);

        if (!data.success) {
            throw new Error(data.error || 'プラネタリウム部の情報取得に失敗しました');
        }

        planetariumParts = data.data || [];

        console.log('取得したプラネタリウム部の情報:', planetariumParts); // デバッグ用
        console.log('プラネタリウム部の数:', planetariumParts.length); // デバッグ用

        // 初期状態で一度更新（参加人数0でも全部表示される）
        updatePlanetariumPartOptions();
        // プラネタリウム参加人数を来場人数に基づいて再生成
        initializePlanetariumCount();
        setLoading(false);

    } catch (error) {
        console.error('プラネタリウム部の情報取得エラー:', error);

        // APIが実装されていない場合のフォールバック：静的データを使用
        console.log('APIが実装されていないため、静的データを使用します');
        planetariumParts = [
            { name: '第1部 (13:30~14:00)', remaining: 30 },
            { name: '第2部 (14:30~15:00)', remaining: 30 },
            { name: '第3部 (15:30~16:00)', remaining: 30 }
        ];

        updatePlanetariumPartOptions();
        // プラネタリウム参加人数を来場人数に基づいて再生成
        initializePlanetariumCount();
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

            if (part.remaining > 0 && canReserve) {
                option.textContent = `${part.name} （残席あり）`;
                availablePartsCount++;
                elements.workshopPart.appendChild(option);
                console.log(`追加した部: ${part.name}`);
            } else {
                // 残席なしまたは参加人数に対して残席不足の場合
                if (part.remaining === 0) {
                    option.textContent = `${part.name} （残席なし）`;
                } else {
                    option.textContent = `${part.name} （残席不足）`;
                }
                option.disabled = true;
                option.style.color = '#999';
                option.style.backgroundColor = '#f5f5f5';
                elements.workshopPart.appendChild(option);
                console.log(`無効な部を追加: ${part.name}`);
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

// プラネタリウム参加人数に応じて部の選択肢を更新
function updatePlanetariumPartOptions() {
    if (!elements.planetariumPart || !elements.planetariumParticipantCount) {
        console.log('updatePlanetariumPartOptions: 必要な要素が見つかりません');
        return;
    }

    const participantCount = parseInt(elements.planetariumParticipantCount.value) || 0;

    console.log('updatePlanetariumPartOptions: 参加人数:', participantCount, 'planetariumParts:', planetariumParts);

    // 既存のオプションをクリア（最初のdefaultオプション以外）
    while (elements.planetariumPart.children.length > 1) {
        elements.planetariumPart.removeChild(elements.planetariumPart.lastChild);
    }

    if (planetariumParts && planetariumParts.length > 0) {
        let availablePartsCount = 0;

        planetariumParts.forEach(part => {
            console.log(`プラネタリウム部: ${part.name}, 残席: ${part.remaining}, 参加人数: ${participantCount}`);

            const option = document.createElement('option');
            option.value = part.name;

            // 参加人数が0の場合は全て表示、それ以外は残席数以上の場合のみ表示
            const canReserve = (participantCount === 0) || (part.remaining >= participantCount);

            if (part.remaining > 0 && canReserve) {
                option.textContent = `${part.name} （残席あり）`;
                availablePartsCount++;
                elements.planetariumPart.appendChild(option);
                console.log(`追加したプラネタリウム部: ${part.name}`);
            } else {
                // 残席なしまたは参加人数に対して残席不足の場合
                if (part.remaining === 0) {
                    option.textContent = `${part.name} （残席なし）`;
                } else {
                    option.textContent = `${part.name} （残席不足）`;
                }
                option.disabled = true;
                option.style.color = '#999';
                option.style.backgroundColor = '#f5f5f5';
                elements.planetariumPart.appendChild(option);
                console.log(`無効なプラネタリウム部を追加: ${part.name}`);
            }
        });

        console.log(`利用可能なプラネタリウム部の数: ${availablePartsCount}, 参加人数: ${participantCount}`);

        // 利用可能な部がない場合のメッセージ
        if (availablePartsCount === 0 && participantCount > 0) {
            const option = document.createElement('option');
            option.textContent = `${participantCount}人での予約可能な部がありません`;
            option.disabled = true;
            elements.planetariumPart.appendChild(option);
            console.log('利用可能なプラネタリウム部がありません');
        }
    } else {
        const option = document.createElement('option');
        option.textContent = '現在予約可能な部がありません';
        option.disabled = true;
        elements.planetariumPart.appendChild(option);
        console.log('planetariumPartsが空またはnull:', planetariumParts);
    }

    // 現在選択されている部が利用できなくなった場合、選択をクリア
    const currentSelection = elements.planetariumPart.value;
    const selectedPart = planetariumParts.find(part => part.name === currentSelection);
    if (selectedPart && participantCount > selectedPart.remaining) {
        elements.planetariumPart.value = '';
    }
}

// 確認画面のコンテンツ生成
function generateConfirmationContent() {
    if (!elements.confirmationContent) return;

    let content = `
        <div style="background: #f8f9fa; border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem;">
            <h4 style="margin-bottom: 1rem; color: #333;">📋 登録内容</h4>
            <div style="display: grid; gap: 0.5rem;">
                <div><strong>来場人数:</strong> ${escapeHtml(formData['来場人数'])}人</div>
                <div><strong>代表者氏名:</strong> ${escapeHtml(formData['代表者氏名'])}</div>
                <div><strong>来場地域:</strong> ${escapeHtml(formData['来場地域'])}</div>
                <div><strong>メールアドレス:</strong> ${escapeHtml(formData['メールアドレス'])}</div>
                <div><strong>当日の交通手段:</strong> ${escapeHtml(formData['当日の交通手段'])}</div>
                ${formData['当日の交通手段'] === '車' ? `<div><strong>お車台数:</strong> ${escapeHtml(formData['お車台数'])}台</div>` : ''}
                <div><strong>プラネタリウム鑑賞:</strong> ${escapeHtml(formData['プラネタリウム鑑賞'])}</div>
                <div><strong>ワークショップ参加:</strong> ${escapeHtml(formData['ワークショップ参加'])}</div>
    `;

    if (formData['ワークショップ参加'] === 'はい') {
        content += `
                <div><strong>ワークショップ参加人数:</strong> ${escapeHtml(formData['ワークショップ参加人数'])}人</div>
                <div><strong>予約する部:</strong> ${escapeHtml(formData['予約する部'])}</div>
        `;
    }

    if (formData['プラネタリウム鑑賞'] === 'はい') {
        content += `
                <div><strong>プラネタリウム参加人数:</strong> ${escapeHtml(formData['プラネタリウム参加人数'])}人</div>
                <div><strong>プラネタリウム予約部:</strong> ${escapeHtml(formData['プラネタリウム予約部'])}</div>
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

// フォーム送信（高速応答版 - 先に完了画面表示）
async function submitForm() {
    try {
        setLoading(true);

        // submitボタンのローディング状態を開始
        setButtonLoading(elements.submitBtn, true, '🎯 登録完了');

        // FormDataを作成
        const formDataForSubmit = new FormData();
        Object.keys(formData).forEach(key => {
            formDataForSubmit.append(key, formData[key]);
        });

        // 短いローディング表示（1秒）後に完了画面表示
        // ユーザー体験向上のため、バックグラウンド処理の前に画面遷移
        setTimeout(() => {
            // 完了画面に先に遷移
            updateStep(CONFIG.STEPS.COMPLETION);
            showResult('予約が送信されました！確認メールをお送りしています...', true);

            // ローディング状態を終了
            setLoading(false);
            setButtonLoading(elements.submitBtn, false, '🎯 登録完了');

            // 送信完了メッセージを表示
            const completionMessage = document.querySelector('.completion-message');
            if (completionMessage) {
                completionMessage.innerHTML = `
                    ✅ ご予約が完了しました！<br>
                    確認メールを送信中です。しばらくお待ちください。<br>
                    当日は気をつけてお越しください。<br>
                    <small style="color: #ffffff; margin-top: 10px; display: block;">
                        予約内容の変更・キャンセル・個人情報の削除をご希望の場合は、<br>
                        kanbokaidaisakusen@gmail.com までご連絡ください。
                    </small>
                `;
            }
        }, 800); // 0.8秒後に完了画面表示（ユーザー体験向上）

        // バックグラウンドでフォーム送信処理を実行
        // 隠しiframeを作成
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.name = 'submitFrame';
        document.body.appendChild(iframe);

        // 動的フォームを作成
        const submitFormElement = document.createElement('form');
        submitFormElement.method = 'POST';
        submitFormElement.action = CONFIG.API_URL;
        submitFormElement.target = 'submitFrame';

        // フォームデータを追加
        Object.keys(formData).forEach(key => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = formData[key];
            submitFormElement.appendChild(input);
        });

        document.body.appendChild(submitFormElement);

        // iframe読み込み完了時の処理
        iframe.onload = function () {
            try {
                console.log('バックグラウンド送信完了');

                // フォームとiframeを削除
                document.body.removeChild(submitFormElement);
                document.body.removeChild(iframe);

                // 送信完了メッセージを更新
                const completionMessage = document.querySelector('.completion-message');
                if (completionMessage) {
                    completionMessage.innerHTML = `
                        ✅ ご予約が完了しました！<br>
                        確認メールをお送りいたしました。<br>
                        当日は気をつけてお越しください。<br>
                        <small style="color: #ffffff; margin-top: 10px; display: block;">
                            予約内容の変更・キャンセル・個人情報の削除をご希望の場合は、<br>
                            kanbokaidaisakusen@gmail.com までご連絡ください。
                        </small>
                    `;
                }
            } catch (error) {
                console.error('送信完了処理エラー:', error);
            }
        };

        // iframe エラー処理
        iframe.onerror = function () {
            console.error('iframe読み込みエラー');
            const completionMessage = document.querySelector('.completion-message');
            if (completionMessage) {
                completionMessage.innerHTML = `
                    ⚠️ 送信中にエラーが発生した可能性があります。<br>
                    しばらく経っても確認メールが届かない場合は、<br>
                    お手数ですが再度お申し込みください。<br>
                    <small style="color: #ffffff; margin-top: 10px; display: block;">
                        問題が解決しない場合は kanbokaidaisakusen@gmail.com までご連絡ください。
                    </small>
                `;
            }
        };

        // 送信タイムアウト検知（30秒）
        let submitCompleted = false;
        const originalOnload = iframe.onload;
        iframe.onload = function () {
            submitCompleted = true;
            originalOnload.call(this);
        };
        setTimeout(() => {
            if (!submitCompleted) {
                console.warn('送信タイムアウト: 30秒以内に応答がありませんでした');
                const completionMessage = document.querySelector('.completion-message');
                if (completionMessage) {
                    completionMessage.innerHTML = `
                        ⚠️ サーバーからの応答に時間がかかっています。<br>
                        予約は送信済みですが、確認メールが届かない場合は<br>
                        再度お申し込みいただくか、下記までご連絡ください。<br>
                        <small style="color: #ffffff; margin-top: 10px; display: block;">
                            kanbokaidaisakusen@gmail.com
                        </small>
                    `;
                }
            }
        }, 30000);

        // フォーム送信
        submitFormElement.submit();

    } catch (error) {
        console.error('登録送信エラー:', error);
        showResult('登録の送信に失敗しました。もう一度お試しください。', false);
        setLoading(false);
        setButtonLoading(elements.submitBtn, false, '🎯 登録完了');
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
    if (participationValue === 'いいえ') {
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

// イベントリスナーの設定
function setupEventListeners() {
    // ナビゲーションボタンのイベント
    elements.backBtn?.addEventListener('click', previousStep);
    elements.nextBtn?.addEventListener('click', nextStep);

    // submitボタンのイベント（ローディング状態管理付き）
    elements.submitBtn?.addEventListener('click', async function (event) {
        event.preventDefault();

        if (!validateCurrentStep()) {
            return;
        }

        // 同意チェック
        if (elements.privacyConsent && !elements.privacyConsent.checked) {
            showResult('個人情報の取り扱いへの同意が必要です。', false);
            return;
        }

        saveCurrentStepData();

        // submitForm関数を呼び出し（内部でローディング管理される）
        await submitForm();
    });

    // プライバシーポリシーリンクのクリックでdetailsを開いてスクロール
    elements.privacyPolicyLink?.addEventListener('click', function (event) {
        event.preventDefault();
        const details = document.querySelector('.privacy-policy');
        if (details) {
            details.open = true;
            details.scrollIntoView({ behavior: 'smooth' });
        }
    });

    // ワークショップ参加選択の変更監視
    elements.workshopParticipation?.addEventListener('change', function () {
        if (this.value === 'いいえ') {
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

    // 来場人数の変更監視（ワークショップとプラネタリウムの参加人数選択肢を更新）
    elements.attendanceCount?.addEventListener('change', function () {
        const newAttendance = parseInt(this.value || 0);
        console.log(`来場人数が変更されました: ${newAttendance}人`);

        // Step 2（ワークショップ）がアクティブな場合、参加人数選択肢を更新
        if (currentStep === CONFIG.STEPS.WORKSHOP_DETAILS) {
            updateWorkshopParticipantOptions();
        }

        // Step 3（プラネタリウム）がアクティブな場合、参加人数選択肢を再生成
        if (currentStep === CONFIG.STEPS.PLANETARIUM_DETAILS) {
            const pSelect = document.getElementById('プラネタリウム参加人数');
            if (pSelect) {
                // 現在の選択を保持
                const currentValue = pSelect.value;
                // オプションをクリアして再生成
                while (pSelect.children.length > 1) {
                    pSelect.removeChild(pSelect.lastChild);
                }
                initializePlanetariumCount();
                // 可能であれば以前の選択を復元
                if (currentValue && parseInt(currentValue) <= newAttendance) {
                    pSelect.value = currentValue;
                }
            }
        }
    });

    // ワークショップ参加人数の選択イベント
    elements.participantCount?.addEventListener('change', function (event) {
        event.stopPropagation(); // イベントの伝播を停止

        setTimeout(() => {
            console.log('参加人数が変更されました:', this.value);
            if (workshopParts && workshopParts.length > 0) {
                updatePartOptions();
            } else {
                console.log('workshopPartsが利用できません:', workshopParts);
            }
        }, 50); // 50ms遅延で実行
    });

    // プラネタリウム参加人数の選択イベント
    elements.planetariumParticipantCount?.addEventListener('change', function (event) {
        event.stopPropagation(); // イベントの伝播を停止

        setTimeout(() => {
            console.log('プラネタリウム参加人数が変更されました:', this.value);
            if (planetariumParts && planetariumParts.length > 0) {
                updatePlanetariumPartOptions();
            } else {
                console.log('planetariumPartsが利用できません:', planetariumParts);
            }
        }, 50); // 50ms遅延で実行
    });

    // 交通手段の変更で台数フィールドの表示切替
    elements.transportMode?.addEventListener('change', function (event) {
        event.stopPropagation(); // イベントの伝播を停止
        const isCar = this.value === '車';
        if (elements.carCountGroup) {
            elements.carCountGroup.classList.toggle('show', isCar);
            elements.carCountGroup.setAttribute('aria-hidden', isCar ? 'false' : 'true');
        }
        if (elements.carCount) {
            if (isCar) {
                elements.carCount.setAttribute('required', 'required');
            } else {
                elements.carCount.removeAttribute('required');
                elements.carCount.value = '';
                delete formData['お車台数'];
            }
        }
    });

    // ワークショップ参加の表示制御（ステップ2のセクション）
    elements.workshopParticipation?.addEventListener('change', function (event) {
        event.stopPropagation();
        const isJoin = this.value === 'はい';
        const workshopSection = document.getElementById('workshop-section');
        if (workshopSection) {
            workshopSection.classList.toggle('show', isJoin);
            workshopSection.setAttribute('aria-hidden', isJoin ? 'false' : 'true');
        }
        // 必須制御
        const wsCount = document.getElementById('ワークショップ参加人数');
        const wsPart = document.getElementById('予約する部');
        if (wsCount && wsPart) {
            if (isJoin) {
                wsCount.setAttribute('required', 'required');
                wsPart.setAttribute('required', 'required');
            } else {
                wsCount.removeAttribute('required');
                wsPart.removeAttribute('required');
                wsCount.value = '';
                wsPart.value = '';
                delete formData['ワークショップ参加人数'];
                delete formData['予約する部'];
            }
        }
    });

    // プラネタリウム鑑賞の表示制御
    elements.planetariumIntent?.addEventListener('change', function (event) {
        event.stopPropagation(); // イベントの伝播を停止
        const isYes = this.value === 'はい';
        const section = document.getElementById('planetarium-section');
        if (section) {
            section.classList.toggle('show', isYes);
            section.setAttribute('aria-hidden', isYes ? 'false' : 'true');
        }
        const pCount = document.getElementById('プラネタリウム参加人数');
        const pPart = document.getElementById('プラネタリウム予約部');
        if (pCount && pPart) {
            if (isYes) {
                pCount.setAttribute('required', 'required');
                pPart.setAttribute('required', 'required');
            } else {
                pCount.removeAttribute('required');
                pPart.removeAttribute('required');
                pCount.value = '';
                pPart.value = '';
                delete formData['プラネタリウム参加人数'];
                delete formData['プラネタリウム予約部'];
            }
        }
    });

    // 初期表示時にも現在の選択状態を反映
    if (elements.transportMode) {
        elements.transportMode.dispatchEvent(new Event('change'));
    }
    if (elements.workshopParticipation) {
        elements.workshopParticipation.dispatchEvent(new Event('change'));
    }
    if (elements.planetariumIntent) {
        elements.planetariumIntent.dispatchEvent(new Event('change'));
    }
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

    // メールアドレス確認フィールドのリアルタイム一致チェック
    if (elements.emailConfirmInput) {
        let confirmTimeout;

        function checkEmailMatch() {
            const email = elements.emailInput?.value?.trim() || '';
            const confirm = elements.emailConfirmInput.value.trim();

            if (confirm === '') {
                showEmailConfirmValidation(true, '');
                return;
            }
            if (!validateEmail(confirm)) {
                showEmailConfirmValidation(false, '❌ 無効なメールアドレス形式です');
                return;
            }
            if (email === confirm) {
                showEmailConfirmValidation(true, '✅ メールアドレスが一致しています');
            } else {
                showEmailConfirmValidation(false, '❌ メールアドレスが一致しません');
            }
        }

        elements.emailConfirmInput.addEventListener('input', function () {
            clearTimeout(confirmTimeout);
            confirmTimeout = setTimeout(checkEmailMatch, CONFIG.TIMEOUTS.EMAIL_VALIDATION);
        });

        elements.emailConfirmInput.addEventListener('blur', checkEmailMatch);
    }
}

// 来場人数のオプションを生成
function initializeAttendanceCount() {
    const attendanceSelect = document.getElementById('来場人数');
    if (attendanceSelect) {
        // 1～100人のオプションを生成
        for (let i = 1; i <= 100; i++) {
            const option = document.createElement('option');
            option.value = i.toString();
            option.textContent = `${i}人`;
            attendanceSelect.appendChild(option);
        }
    }
}

// プラネタリウム参加人数のオプションを生成（1～30、ただし来場人数以下に制限）
function initializePlanetariumCount() {
    const pSelect = document.getElementById('プラネタリウム参加人数');
    if (!pSelect) return;

    // 来場人数を取得
    const totalAttendance = parseInt(formData['来場人数'] || elements.attendanceCount?.value || 0);
    const maxCount = totalAttendance > 0 ? Math.min(totalAttendance, 30) : 30;

    console.log(`プラネタリウム参加人数の選択肢を生成: 最大${maxCount}人（来場人数: ${totalAttendance}人）`);

    // 現在の選択を保持
    const currentValue = pSelect.value;

    // 既存のオプションをクリア（placeholder以外）
    while (pSelect.children.length > 1) {
        pSelect.removeChild(pSelect.lastChild);
    }

    for (let i = 1; i <= maxCount; i++) {
        const option = document.createElement('option');
        option.value = i.toString();
        option.textContent = `${i}人`;
        pSelect.appendChild(option);
    }

    // 可能であれば以前の選択を復元、不可能な場合はリセット
    if (currentValue && parseInt(currentValue) <= maxCount) {
        pSelect.value = currentValue;
    } else if (currentValue && totalAttendance > 0) {
        pSelect.value = '';
        console.log(`プラネタリウム参加人数をリセット: ${currentValue}人は来場人数${totalAttendance}人を超過`);
    }
}

// ワークショップ参加人数のオプションを来場人数に基づいて制限
function updateWorkshopParticipantOptions() {
    const wsSelect = document.getElementById('ワークショップ参加人数');
    if (!wsSelect) return;

    // 来場人数を取得
    const totalAttendance = parseInt(formData['来場人数'] || elements.attendanceCount?.value || 0);

    console.log(`ワークショップ参加人数の選択肢を更新: 来場人数${totalAttendance}人に基づいて制限`);

    // 既存のオプションを確認して制限
    const options = wsSelect.querySelectorAll('option');
    options.forEach(option => {
        if (option.value && option.value !== '') {
            const optionValue = parseInt(option.value);
            if (totalAttendance > 0 && optionValue > totalAttendance) {
                option.disabled = true;
                option.textContent = `${optionValue}人（来場人数を超過）`;
                option.style.color = '#999';
            } else {
                option.disabled = false;
                option.textContent = `${optionValue}人`;
                option.style.color = '';
            }
        }
    });

    // 現在選択されている値が制限を超えている場合はリセット
    if (wsSelect.value && totalAttendance > 0) {
        const currentValue = parseInt(wsSelect.value);
        if (currentValue > totalAttendance) {
            wsSelect.value = '';
            console.log(`ワークショップ参加人数をリセット: ${currentValue}人は来場人数${totalAttendance}人を超過`);
        }
    }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    // UIエレメントを初期化
    initializeElements();

    // 来場人数のオプションを生成
    initializeAttendanceCount();
    // プラネタリウム参加人数のオプションを生成
    initializePlanetariumCount();

    // イベントリスナーを設定
    setupEventListeners();

    // ローディング状態を初期化（非表示に）
    setLoading(false);

    // アクセシビリティ管理を初期化
    AccessibilityManager.manageAriaHidden();

    updateStep(CONFIG.STEPS.BASIC_INFO);
});
