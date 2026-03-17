// Capacitor Plugin Handler
document.addEventListener('DOMContentLoaded', () => {
    // We only execute if window.Capacitor is ready
    if (window.Capacitor && window.Capacitor.Plugins) {
        const { App, StatusBar } = window.Capacitor.Plugins;

        // --- Back Button Handler ---
        if (App) {
            App.addListener('backButton', () => {
                // Better history handling
                if (window.history.length > 1) {
                    window.history.back();
                } else {
                    App.exitApp();
                }
            });
        }

        // --- Full Screen Handler ---
        if (StatusBar) {
            StatusBar.hide().catch(e => console.log(e));
        }
    }
});
