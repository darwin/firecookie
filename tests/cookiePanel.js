function runTest()
{
    FBTest.sysout("cookies.fbtest.cookiePanel.START");
    FBTest.loadScript("env.js", this);
    var browser = FBTest.FirebugWindow;

    openURL(basePath + "cookiePanel.html", function(win)
    {
        FBTest.sysout("cookies.fbtest.cookiePanel; Check existence of the Cookies panel.");

        // Make sure the Cookie panel's UI is there.
        browser.Firebug.showBar(true);
        var panel = browser.FirebugChrome.selectPanel("cookies");

        FBTest.ok(panel.panelNode, "Cookies panel must be initialized.");

        // Finish test
        FBTest.sysout("cookies.fbtest.cookiePanel.DONE");
        FBTest.testDone();
    });
};
