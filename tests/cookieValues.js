function runTest()
{
    FBTest.sysout("cookies.fbtest.cookieValues; START");
    FBTest.loadScript("env.js", this);
    var browser = FBTest.FirebugWindow;

    // Server side handler.
    FBTest.registerPathHandler("/cookieValues.html", function (metadata, response) 
    {
        FBTest.sysout("cookies.fbtest.cookieValues; Server side handler executed.");
        response.setHeader("Set-Cookie", 
            "TestCookie=Test Cookie Value; " +
            "expires=Wed, 01-Jan-2020 00:00:00 GMT; " +
            "path=/dir; " +
            "HttpOnly", 
            false);
        response.write("<html><head><title>Cookie Values</title></head><body>" +
            "<h1>Test cookie values.</h1>" +
            "</body></html>");
    });

    openURL(basePath + "cookieValues.html", function(win)
    {
        FBTest.sysout("cookies.fbtest.cookiePanel; Check cookie values");

        // Make sure the Cookie panel's UI is there.
        browser.Firebug.showBar(true);
        var panelNode = browser.FirebugChrome.selectPanel("cookies").panelNode;

        // Check displayed values.
        var name = FBL.getElementByClass(panelNode, "cookieNameLabel", "cookieLabel");
        FBTest.compare("TestCookie", name.textContent, "Name of the cookie validation");

        var value = FBL.getElementByClass(panelNode, "cookieValueLabel", "cookieLabel");
        FBTest.compare("Test Cookie Value", value.textContent, "Value of the cookie validation");

        var domain = FBL.getElementByClass(panelNode, "cookieDomainLabel", "cookieLabel");
        FBTest.compare("localhost", domain.textContent, "Domain of the cookie validation");

        var size = FBL.getElementByClass(panelNode, "cookieSizeLabel", "cookieLabel");
        FBTest.compare("27 B", size.textContent, "Size of the cookie validation");

        var path = FBL.getElementByClass(panelNode, "cookiePathLabel", "cookieLabel");
        FBTest.compare("/dir", path.textContent, "Path of the cookie validation");

        // xxxHonza: TODO
        //var expires = FBL.getElementByClass(panelNode, "cookieExpiresLabel","cookieLabel");
        //FBTest.compare("...", expires.textContent, "Expire date of the cookie validation");

        var httpOnly = FBL.getElementByClass(panelNode, "cookieHttpOnlyLabel","cookieLabel");
        FBTest.compare("HttpOnly", httpOnly.textContent, "HTTP Only flag validation");

        expandCookieRows(panelNode, "cookieRow");
        var cookieInfo = FBL.getElementsByClass(panelNode, "cookieInfoRow");

        var infoValue = FBL.getElementByClass(panelNode, "cookieInfoValueText", "cookieInfoText");
        FBTest.compare("Test Cookie Value", infoValue.textContent, "Value of the cookie (in the body) validation");

        // Finish test
        //removeCurrentTab();
        FBTest.sysout("cookies.fbtest.cookieValues; DONE");
        FBTest.testDone();
    });
};
