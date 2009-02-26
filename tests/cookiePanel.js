function runTest()
{
    FBTest.sysout("cookies.fbtest.cookiePanel.START");
    FBTest.loadScript("env.js", this);

    FBTestFirebug.openNewTab(basePath + "cookiePanel.html", function(win)
    {
        FBTestFireCookie.enableCookiePanel(function(win) 
        {
            FBTest.sysout("cookies.fbtest.cookiePanel; Check existence of the Cookies panel.");

            // Make sure the Cookie panel's UI is there.
            FBTestFirebug.openFirebug(true);
            var panel = FBTestFirebug.selectPanel("cookies");

            FBTest.ok(panel.panelNode, "Cookies panel must be initialized.");

            // Finish test
            FBTestFirebug.testDone("cookies.fbtest.cookiePanel.DONE");
        });
    });
};
