function runTest()
{
    FBTest.sysout("cookies.fbtest.issue18; START");
    FBTest.loadScript("env.js", this);
    var browser = FBTest.FirebugWindow;

    // Server side handler.
    FBTest.registerPathHandler("/issue18.html", function (metadata, response) 
    {
        FBTest.sysout("cookies.fbtest.issue18; Server side handler executed.");
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

    openURL(basePath + "issue18.html", function(win)
    {
        FBTest.sysout("cookies.fbtest.issue18; Check clipboard functionality");

        // Make sure the Cookie panel's UI is there.
        browser.Firebug.showBar(true);
        var panelNode = browser.FirebugChrome.selectPanel("cookies").panelNode;

        var value = browser.FBL.getElementByClass(panelNode, "cookieValueLabel", "cookieLabel");
        FBTest.compare("1 + 2 = 3", value.textContent, "Value of the cookie validation");

        expandCookieRows(panelNode, "cookieRow");
        var cookieInfo = browser.FBL.getElementsByClass(panelNode, "cookieInfoRow")[0];
        expandCookieTabs(cookieInfo, "cookieInfoRawValueTab");

        var infoValue = browser.FBL.getElementByClass(cookieInfo, 
            "cookieInfoValueText", "cookieInfoText");
        FBTest.compare("1 + 2 = 3", infoValue.textContent, 
            "Value of the cookie (in the body) validation");

        var rawInfoValue = browser.FBL.getElementByClass(cookieInfo, 
            "cookieInfoRawValueText", "cookieInfoText");
        FBTest.compare("1 %2B 2 = 3", rawInfoValue.textContent, 
            "Raw value of the cookie (in the body) validation");

        // Finish test
        FBTest.sysout("cookies.fbtest.issue18; DONE");
        FBTest.testDone();
    });
};
