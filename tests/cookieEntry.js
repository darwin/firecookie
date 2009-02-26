function runTest()
{
    FBTest.sysout("cookies.fbtest.cookieEntry; START");
    FBTest.loadScript("env.js", this);
    var browser = FBTest.FirebugWindow;

    // Server side handler.
    FBTest.registerPathHandler("/cookieEntry.html", function (metadata, response) 
    {
        FBTest.sysout("cookies.fbtest.cookieEntry; Server side handler executed.");
        response.setHeader("Set-Cookie", 
            "TestCookie=Test Cookie Value; " +
            "expires=Wed, 01-Jan-2020 00:00:00 GMT; " +
            "path=/dir; " +
            "HttpOnly", 
            false);
        response.write("<html><head><title>Cookie Entry</title></head><body>" +
            "<h1>Test for existence of Cookies panel entry.</h1>" +
            "</body></html>");
    });

    FBTestFirebug.openNewTab(basePath + "cookieEntry.html", function(win)
    {
        FBTest.sysout("cookies.fbtest.cookieEntry; Check cookie entry in the Cookies panel");

        // Open Firebug UI and enable Net panel.
        FBTestFireCookie.enableCookiePanel(function(win) 
        {
            // Make sure the Cookie panel's UI is there.
            FBTestFirebug.openFirebug(true);
            var panelNode = FBTestFirebug.selectPanel("cookies").panelNode;
    
            var cookieRow = FW.FBL.getElementsByClass(panelNode, "cookieRow");
            FBTest.ok(cookieRow.length > 0, "There must be at least one cookie displayed");

            FBTestFirebug.expandElements(panelNode, "cookieRow");

            var cookieInfo = FW.FBL.getElementsByClass(panelNode, "cookieInfoRow");
            FBTest.ok(cookieInfo.length > 0, "There must be at least one info-body displayed");

            // Finish test
            FBTestFirebug.testDone("cookies.fbtest.cookieEntry; DONE");
        });
    });
};
