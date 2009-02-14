function runTest()
{
    FBTest.sysout("cookies.fbtest.cookieClipboard; START");
    FBTest.loadScript("env.js", this);
    var browser = FBTest.FirebugWindow;

    // Server side handler.
    FBTest.registerPathHandler("/cookieClipboard.html", function (metadata, response) 
    {
        FBTest.sysout("cookies.fbtest.cookieClipboard; Server side handler executed.");
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

    openURL(basePath + "cookieClipboard.html", function(win)
    {
        FBTest.sysout("cookies.fbtest.cookieClipboard; Check clipboard functionality");

        // Make sure the Cookie panel's UI is there.
        browser.Firebug.showBar(true);
        var panelNode = browser.FirebugChrome.selectPanel("cookies").panelNode;

        // Helper shortcuts
        var CookieRow = browser.Firebug.FireCookieModel.Templates.CookieRow;
        var CookieClipboard = browser.Firebug.FireCookieModel.CookieClipboard

        // Copy cookie into the clipboard, get from clipboard again and check.
        var cookieRow = browser.FBL.getElementsByClass(panelNode, "cookieRow")[0];
        var cookie = cookieRow.repObject;
        CookieRow.onCopy(cookie);

        var values = CookieClipboard.getFrom();
        FBTest.compare("TestCookie", values.name, "Result from clipboard: name verified.");
        FBTest.compare("Test%20Cookie%20Value", values.value, "Result from clipboard: value verified.");
        FBTest.compare("1577836800", values.expires, "Result from clipboard: expire date verified.");
        FBTest.compare("/dir", values.path, "Result from clipboard: path verified.");
        FBTest.compare("localhost", values.host, "Result from clipboard: host verified.");
        FBTest.ok(values.isHttpOnly, "Result from clipboard: HTTP Only flag verified.");

        // Finish test
        FBTest.sysout("cookies.fbtest.cookieClipboard; DONE");
        FBTest.testDone();
    });
};
