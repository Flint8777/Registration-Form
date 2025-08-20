// analytics.js - Google Analytics 設定
// このファイルは実際のアナリティクス導入時に使用

class AnalyticsManager {
    constructor(measurementId) {
        this.measurementId = measurementId;
        this.isProduction = window.location.hostname !== 'localhost';
        this.init();
    }

    init() {
        if (!this.isProduction) {
            console.log('Analytics: Development mode - tracking disabled');
            return;
        }

        // Google Analytics初期化
        if (this.measurementId && this.measurementId !== 'GA_MEASUREMENT_ID') {
            this.loadGtagScript();
            this.setupGtag();
        }
    }

    loadGtagScript() {
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${this.measurementId}`;
        document.head.appendChild(script);
    }

    setupGtag() {
        window.dataLayer = window.dataLayer || [];
        function gtag() { dataLayer.push(arguments); }
        gtag('js', new Date());
        gtag('config', this.measurementId, {
            // プライバシー設定
            anonymize_ip: true,
            cookie_flags: 'SameSite=None;Secure'
        });

        // カスタムイベント設定
        this.setupCustomEvents();
    }

    setupCustomEvents() {
        // フォーム開始イベント
        document.addEventListener('DOMContentLoaded', () => {
            const formSteps = document.querySelectorAll('.step');
            formSteps.forEach((step, index) => {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            this.trackEvent('form_step_view', {
                                step_number: index + 1,
                                step_name: step.dataset.step || `step_${index + 1}`
                            });
                        }
                    });
                }, { threshold: 0.5 });

                observer.observe(step);
            });

            // 予約完了イベント
            document.addEventListener('reservationComplete', (e) => {
                this.trackEvent('reservation_complete', {
                    participants: e.detail.participants,
                    workshop: e.detail.workshop,
                    planetarium: e.detail.planetarium
                });
            });

            // エラーイベント
            document.addEventListener('formError', (e) => {
                this.trackEvent('form_error', {
                    error_type: e.detail.type,
                    error_message: e.detail.message
                });
            });
        });
    }

    trackEvent(eventName, parameters = {}) {
        if (!this.isProduction) {
            console.log('Analytics Event:', eventName, parameters);
            return;
        }

        if (typeof gtag !== 'undefined') {
            gtag('event', eventName, {
                ...parameters,
                timestamp: new Date().toISOString()
            });
        }
    }

    trackPageView(page) {
        if (!this.isProduction) {
            console.log('Analytics Page View:', page);
            return;
        }

        if (typeof gtag !== 'undefined') {
            gtag('config', this.measurementId, {
                page_path: page
            });
        }
    }
}

// 使用方法:
// const analytics = new AnalyticsManager('GA_MEASUREMENT_ID');

// 手動でイベントを追跡する場合:
// analytics.trackEvent('button_click', { button_name: 'submit_reservation' });
