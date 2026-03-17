// Capacitor Plugin Handler
document.addEventListener('DOMContentLoaded', () => {
    // We only execute if window.Capacitor is ready
    if (window.Capacitor && window.Capacitor.Plugins) {
        const { App, StatusBar } = window.Capacitor.Plugins;

        // --- Back Button Handler ---
        if (App) {
            App.addListener('backButton', ({ canGoBack }) => {
                const path = window.location.pathname;
                // If we are at the root or index.html, pressing back exits the app
                if (path === '/' || path.endsWith('index.html') || path.length === 0) {
                    App.exitApp();
                } else {
                    // Otherwise, just go back in history (e.g., from Reader -> Details, or Details -> Home)
                    window.history.back();
                }
            });
        }

        // --- Full Screen Handler ---
        if (StatusBar) {
            StatusBar.hide().catch(e => console.log(e));
        }
    }
});
