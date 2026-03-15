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
            const isReader = window.location.pathname.includes('reader.html');
            if (isReader) {
                // In Reading Mode, hide the status bar (real fullscreen)
                StatusBar.hide().catch(e => console.log(e));
            } else {
                // In Home and Details, show the status bar so it pushes content down properly
                StatusBar.show().catch(e => console.log(e));
                
                // Set color to match our dark theme, otherwise it might be transparent/white
                StatusBar.setBackgroundColor({ color: '#0f172a' }).catch(e => console.log(e));
                
                // Use Overlays=true so we can control padding with env(safe-area-inset-top)?
                // Actually setOverlaysWebView(false) is default and usually best so it doesn't overlap native-side,
                // but setting false ensures it does not overlay our HTML!
                if(StatusBar.setOverlaysWebView) {
                    StatusBar.setOverlaysWebView({ overlay: false }).catch(e => console.log(e));
                }
            }
        }
    }
});
