function runTest()
{
    FBTest.sysout("cookies.test.issue18; START");
    FBTest.loadScript("env.js", this);

    // Server side handler.
    FBTest.registerPathHandler("/issue18.php", function (metadata, response) 
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

    FBTestFirebug.openNewTab(basePath + "issue18/issue18.php", function(win)
    {
        // Open Firebug UI and enable Net panel.
        FBTestFireCookie.enableCookiePanel(function(win) 
        {
            FBTest.sysout("cookies.test.issue18; Check clipboard functionality");

            // Make sure the Cookie panel's UI is there.
            FBTestFirebug.openFirebug();
            var panelNode = FBTestFirebug.selectPanel("cookies").panelNode;

            // Get proper (for this test) cookie row.
            var row = FBTestFireCookie.getCookieRowByName(panelNode, "TestCookie18");

            // Test label displayed in the row.
            var value = FW.FBL.getElementByClass(row, "cookieValueLabel", "cookieLabel");
            FBTest.compare("1 + 2 = 3", value.textContent, "Value of the cookie validation");

            // Expand cookie info.
            FBTest.click(row);

            // Get the only expanded info element and select Raw Value tab so, its 
            // content is also generated.
            var cookieInfo = FW.FBL.getElementsByClass(panelNode, "cookieInfoRow")[0];
            FBTestFirebug.expandElements(cookieInfo, "cookieInfoRawValueTab");

            // Verify content of the Value tab.
            var infoValue = FW.FBL.getElementByClass(cookieInfo, 
                "cookieInfoValueText", "cookieInfoText");
            FBTest.compare("1 + 2 = 3", infoValue.textContent, 
                "Value of the cookie (in the body) validation");

            // Verify content of the Raw Value tab.
            var rawInfoValue = FW.FBL.getElementByClass(cookieInfo, 
                "cookieInfoRawValueText", "cookieInfoText");
            FBTest.compare("1+%2B+2+%3D+3", rawInfoValue.textContent, 
                "Raw value of the cookie (in the body) validation");

            // Finish test
            FBTestFirebug.testDone("cookies.test.issue18; DONE");
        });
    });
};
