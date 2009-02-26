function runTest()
{
    FBTest.sysout("cookies.test.issue18; START");
    FBTest.loadScript("env.js", this);

    // Server side handler.
    FBTest.registerPathHandler("/issue18.html", function (metadata, response) 
    {
        FBTest.sysout("cookies.test.issue18; Server side handler executed.");
        response.setHeader("Set-Cookie", 
            "TestCookie=1 %2B 2 = 3; " +
            "expires=Wed, 01-Jan-2020 00:00:00 GMT; " +
            "path=/dir; " +
            "HttpOnly", 
            false);
        response.write("<html><head><title>Cookie Entry</title></head><body>" +
            "<h1>Issue 18: Unescape cookie values</h1>" +
            "</body></html>");
    });

    FBTestFirebug.openNewTab(basePath + "issue18.html", function(win)
    {
        // Open Firebug UI and enable Net panel.
        FBTestFireCookie.enableCookiePanel(function(win) 
        {
            FBTest.sysout("cookies.test.issue18; Check clipboard functionality");

            // Make sure the Cookie panel's UI is there.
            FBTestFirebug.openFirebug();
            var panelNode = FBTestFirebug.selectPanel("cookies").panelNode;

            var value = FW.FBL.getElementByClass(panelNode, "cookieValueLabel", "cookieLabel");
            FBTest.compare("1 + 2 = 3", value.textContent, "Value of the cookie validation");

            FBTestFirebug.expandElements(panelNode, "cookieRow");
            var cookieInfo = FW.FBL.getElementsByClass(panelNode, "cookieInfoRow")[0];
            FBTestFirebug.expandElements(cookieInfo, "cookieInfoRawValueTab");

            var infoValue = FW.FBL.getElementByClass(cookieInfo, 
                "cookieInfoValueText", "cookieInfoText");
            FBTest.compare("1 + 2 = 3", infoValue.textContent, 
                "Value of the cookie (in the body) validation");

            var rawInfoValue = FW.FBL.getElementByClass(cookieInfo, 
                "cookieInfoRawValueText", "cookieInfoText");
            FBTest.compare("1 %2B 2 = 3", rawInfoValue.textContent, 
                "Raw value of the cookie (in the body) validation");

            // Finish test
            FBTestFirebug.testDone("cookies.test.issue18; DONE");
        });
    });
};
