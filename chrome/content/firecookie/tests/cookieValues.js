function runTest()
{
    FBTest.sysout("cookies.test.cookieValues; START");
    FBTest.loadScript("env.js", this);

    // Server side handler.
    FBTest.registerPathHandler("/cookieValues.html", function (metadata, response) 
    {
        FBTest.sysout("cookies.test.cookieValues; Server side handler executed.");
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

    FBTestFirebug.openNewTab(basePath + "cookieValues.html", function(win)
    {
        FBTestFireCookie.enableCookiePanel(function(win) 
        {
            FBTest.sysout("cookies.test.cookiePanel; Check cookie values");

            // Make sure the Cookie panel's UI is there.
            FW.Firebug.showBar(true);
            var panelNode = FW.FirebugChrome.selectPanel("cookies").panelNode;

            // Check displayed values.
            var name = FW.FBL.getElementByClass(panelNode, "cookieNameLabel", "cookieLabel");
            FBTest.compare("TestCookie", name.textContent, "Name of the cookie validation");

            var value = FW.FBL.getElementByClass(panelNode, "cookieValueLabel", "cookieLabel");
            FBTest.compare("Test Cookie Value", value.textContent, "Value of the cookie validation");

            var domain = FW.FBL.getElementByClass(panelNode, "cookieDomainLabel", "cookieLabel");
            FBTest.compare("localhost", domain.textContent, "Domain of the cookie validation");

            var size = FW.FBL.getElementByClass(panelNode, "cookieSizeLabel", "cookieLabel");
            FBTest.compare("27 B", size.textContent, "Size of the cookie validation");

            var path = FW.FBL.getElementByClass(panelNode, "cookiePathLabel", "cookieLabel");
            FBTest.compare("/dir", path.textContent, "Path of the cookie validation");

            // xxxHonza: TODO
            //var expires = FW.FBL.getElementByClass(panelNode, "cookieExpiresLabel","cookieLabel");
            //FBTest.compare("...", expires.textContent, "Expire date of the cookie validation");

            var httpOnly = FW.FBL.getElementByClass(panelNode, "cookieHttpOnlyLabel","cookieLabel");
            FBTest.compare("HttpOnly", httpOnly.textContent, "HTTP Only flag validation");

            FBTestFirebug.expandElements(panelNode, "cookieRow");
            var cookieInfo = FW.FBL.getElementsByClass(panelNode, "cookieInfoRow");

            var infoValue = FW.FBL.getElementByClass(panelNode, "cookieInfoValueText", "cookieInfoText");
            FBTest.compare("Test Cookie Value", infoValue.textContent, "Value of the cookie (in the body) validation");

            // Finish test
            //removeCurrentTab();
            FBTest.sysout("cookies.test.cookieValues; DONE");
            FBTest.testDone();
        });
    });
};
