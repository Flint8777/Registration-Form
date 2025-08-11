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
        PLANETARIUM_DETAILS: 3,
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
        ATTENDANCE_COUNT: '#来場人数',
        PARTICIPANT_COUNT: '#ワークショップ参加人数',
        WORKSHOP_PART: '#予約する部',
        WORKSHOP_PARTICIPATION: '#ワークショップ参加',
        PLANETARIUM_INTENT: '#プラネタリウム鑑賞',
        PLANETARIUM_PARTICIPANT_COUNT: '#プラネタリウム参加人数',
        PLANETARIUM_PART: '#プラネタリウム予約部',
        TRANSPORT_MODE: '#当日の交通手段',
        CAR_COUNT_GROUP: '#car-count-group',
        CAR_COUNT: '#お車台数'
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
        carCount: getElement(CONFIG.SELECTORS.CAR_COUNT)
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
    const lastDataStep = (workshopParticipation === '参加する')
        ? ((planetariumIntent === 'はい') ? CONFIG.STEPS.PLANETARIUM_DETAILS : CONFIG.STEPS.WORKSHOP_DETAILS)
        : ((planetariumIntent === 'はい') ? CONFIG.STEPS.PLANETARIUM_DETAILS : CONFIG.STEPS.BASIC_INFO);

    // 最終入力ステップでは送信ボタン、それ以外は次へ
    if (step === lastDataStep) {
        if (elements.submitBtn) elements.submitBtn.classList.add(CONFIG.CLASSES.VISIBLE);
    } else {
        if (elements.nextBtn) elements.nextBtn.classList.add(CONFIG.CLASSES.VISIBLE);
    }
}

// 前のステップへ
function previousStep() {
    if (currentStep <= CONFIG.STEPS.BASIC_INFO) return;

    if (currentStep === CONFIG.STEPS.PLANETARIUM_DETAILS) {
        const workshopParticipation = formData['ワークショップ参加'] || elements.workshopParticipation?.value;
        const target = (workshopParticipation === '参加する') ? CONFIG.STEPS.WORKSHOP_DETAILS : CONFIG.STEPS.BASIC_INFO;
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
            if (workshopParticipation === '参加する') {
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
            // どちらも不要なら送信
            console.log('両方不要のため直接送信');
            setButtonLoading(elements.nextBtn, false);
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
        if (workshopParticipation === '参加する') {
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
        if (workshopParticipation !== '参加する') {
            delete formData['ワークショップ参加人数'];
            delete formData['予約する部'];
        }
    }
}

// iframe環境でのJSONP対応
function fetchWithJsonp(url) {
    return new Promise((resolve, reject) => {
        const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());

        // グローバルコールバック関数を作成
        window[callbackName] = function (data) {
            delete window[callbackName];
            document.body.removeChild(script);
            resolve(data);
        };

        // スクリプトタグを作成してJSONPリクエスト
        const script = document.createElement('script');
        script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + callbackName;
        script.onerror = function () {
            delete window[callbackName];
            document.body.removeChild(script);
            reject(new Error('JSONP request failed'));
        };

        document.body.appendChild(script);

        // タイムアウト処理
        setTimeout(() => {
            if (window[callbackName]) {
                delete window[callbackName];
                document.body.removeChild(script);
                reject(new Error('JSONP request timeout'));
            }
        }, 10000);
    });
}

// ワークショップの部情報を取得
async function loadWorkshopParts() {
    try {
        setLoading(true);

        // iframe環境での制限を検知
        const isIframe = window.self !== window.top;
        console.log('iframe環境:', isIframe);

        let data;

        // キャッシュ回避のためタイムスタンプを追加
        const timestamp = new Date().getTime();
        const apiUrl = `${CONFIG.API_URL}?action=getParts&t=${timestamp}`;

        if (isIframe) {
            // iframe環境ではJSONPを使用
            console.log('iframe環境のためJSONPを使用');
            data = await fetchWithJsonp(apiUrl);
        } else {
            // 通常環境ではfetchを使用
            console.log('通常環境のためfetchを使用');
            const response = await fetch(apiUrl, {
                method: 'GET',
                cache: 'no-cache', // キャッシュを無効化
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            data = await response.json();
        }

        console.log('APIレスポンス全体:', data); // デバッグ用

        // APIレスポンスの成功/失敗を確認
        if (!data.success) {
            throw new Error(data.error || '部の情報取得に失敗しました');
        }

        workshopParts = data.data || [];

        console.log('取得した部の情報:', workshopParts); // デバッグ用
        console.log('部の数:', workshopParts.length); // デバッグ用

        // 残席数の詳細ログ出力
        workshopParts.forEach(part => {
            console.log(`🎯 ${part.name}: 定員${part.capacity}席, 予約済み${part.reserved}席, 残席${part.remaining}席`);
        });

        // 初期状態で一度更新（参加人数0でも全部表示される）
        updatePartOptions();
        // ワークショップ参加人数の選択肢を来場人数に基づいて制限
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

        // iframe環境での制限を検知
        const isIframe = window.self !== window.top;
        console.log('iframe環境:', isIframe);

        let data;

        if (isIframe) {
            // iframe環境ではJSONPを使用
            console.log('iframe環境のためJSONPを使用');
            data = await fetchWithJsonp(`${CONFIG.API_URL}?action=getPlanetariumParts`);
        } else {
            // 通常環境ではfetchを使用
            console.log('通常環境のためfetchを使用');
            const response = await fetch(`${CONFIG.API_URL}?action=getPlanetariumParts`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            data = await response.json();
        }

        console.log('プラネタリウムAPIレスポンス全体:', data); // デバッグ用

        // APIレスポンスの成功/失敗を確認
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

            if (canReserve && part.remaining > 0) {
                option.textContent = `${part.name} （残席: ${part.remaining}席）`;
                availablePartsCount++;
                elements.planetariumPart.appendChild(option);
                console.log(`追加したプラネタリウム部: ${part.name}`);
            } else if (canReserve && part.remaining === 0) {
                option.textContent = `${part.name} （満席）`;
                option.disabled = true;
                elements.planetariumPart.appendChild(option);
                console.log(`満席のプラネタリウム部を追加: ${part.name}`);
            } else {
                console.log(`除外したプラネタリウム部: ${part.name} (残席${part.remaining} < 参加人数${participantCount})`);
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
                <div><strong>来場人数:</strong> ${formData['来場人数'] || ''}人</div>
                <div><strong>代表者氏名:</strong> ${formData['代表者氏名'] || ''}</div>
                <div><strong>来場地域:</strong> ${formData['来場地域'] || ''}</div>
                <div><strong>メールアドレス:</strong> ${formData['メールアドレス'] || ''}</div>
                <div><strong>当日の交通手段:</strong> ${formData['当日の交通手段'] || ''}</div>
                ${formData['当日の交通手段'] === '車' ? `<div><strong>お車台数:</strong> ${formData['お車台数'] || ''}台</div>` : ''}
                <div><strong>プラネタリウム鑑賞:</strong> ${formData['プラネタリウム鑑賞'] || ''}</div>
                <div><strong>ワークショップ参加:</strong> ${formData['ワークショップ参加'] || ''}</div>
    `;

    if (formData['ワークショップ参加'] === '参加する') {
        content += `
                <div><strong>ワークショップ参加人数:</strong> ${formData['ワークショップ参加人数'] || ''}人</div>
                <div><strong>予約する部:</strong> ${formData['予約する部'] || ''}</div>
        `;
    }

    if (formData['プラネタリウム鑑賞'] === 'はい') {
        content += `
                <div><strong>プラネタリウム参加人数:</strong> ${formData['プラネタリウム参加人数'] || ''}人</div>
                <div><strong>プラネタリウム予約部:</strong> ${formData['プラネタリウム予約部'] || ''}</div>
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

        // submitボタンのローディング状態を開始
        setButtonLoading(elements.submitBtn, true, '🎯 登録完了');

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
            setTimeout(() => {
                try {
                    // 成功と仮定してステップ4に移行
                    updateStep(CONFIG.STEPS.COMPLETION);
                    showResult('予約が正常に送信されました！', true);

                    // フォームとiframeを削除
                    document.body.removeChild(submitFormElement);
                    document.body.removeChild(iframe);

                    // ローディング状態を終了
                    setLoading(false);
                    setButtonLoading(elements.submitBtn, false, '🎯 登録完了');
                } catch (error) {
                    console.error('送信完了処理エラー:', error);
                    setLoading(false);
                    setButtonLoading(elements.submitBtn, false, '🎯 登録完了');
                }
            }, 1000);
        };

        // iframe エラー処理
        iframe.onerror = function () {
            console.error('iframe読み込みエラー');
            setLoading(false);
            setButtonLoading(elements.submitBtn, false, '🎯 登録完了');
            showResult('送信処理でエラーが発生しました。もう一度お試しください。', false);
        };

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

    // submitボタンのイベント（ローディング状態管理付き）
    elements.submitBtn?.addEventListener('click', async function (event) {
        event.preventDefault(); // デフォルトの送信を防止

        // バリデーションチェック
        if (!validateCurrentStep()) {
            return;
        }

        // データ保存
        saveCurrentStepData();

        // submitForm関数を呼び出し（内部でローディング管理される）
        await submitForm();
    });

    // 右上のiframe閉じるボタン
    getElement('.close-iframe-top-btn')?.addEventListener('click', function () {
        closeIframe();
    });

    // iframe閉じるボタン（完了画面）
    getElement('.close-iframe-btn')?.addEventListener('click', function () {
        closeIframe();
    });

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
        event.stopPropagation(); // イベントの伝播を停止
        const isJoin = this.value === '参加する';
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

    // iframe環境の検出と右上バツボタンの表示制御
    const closeTopBtn = getElement('.close-iframe-top-btn');
    if (closeTopBtn) {
        if (window.self !== window.top) {
            // iframe内で実行されている場合はボタンを表示
            closeTopBtn.classList.remove('hidden');
            console.log('iframe環境を検出：右上閉じるボタンを表示');
        } else {
            // 通常ウィンドウの場合はボタンを非表示
            closeTopBtn.classList.add('hidden');
            console.log('通常ウィンドウ環境：右上閉じるボタンを非表示');
        }
    }

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
