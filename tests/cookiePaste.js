function runTest()
{
    FBTest.sysout("cookies.test.cookiePaste; START");
    FBTest.loadScript("env.js", this);

    // Server side handler.
    FBTest.registerPathHandler("/cookiePaste.html", function (metadata, response) 
    {
        FBTest.sysout("cookies.test.cookiePaste; Server side handler executed.");
        response.setHeader("Set-Cookie", 
            "CopyPasteCookie=Test Cookie Value; " +
            "expires=Wed, 01-Jan-2020 00:00:00 GMT; " +
            "path=/dir; " +
            false);
        response.write("<html><head><title>Cookie Copy & Paste</title></head><body>" +
            "<h1>Test for cooki Copy & Paste.</h1>" +
            "</body></html>");
    });

    FBTestFirebug.openNewTab(basePath + "cookiePaste.html", function(win)
    {
        FBTestFireCookie.enableCookiePanel(function(win) 
        {
            FBTest.sysout("cookies.test.cookiePaste; Check clipboard functionality");

            // Make sure the Cookie panel's UI is there.
            FBTestFirebug.openFirebug(true);
            var panelNode = FBTestFirebug.selectPanel("cookies").panelNode;

            // Copy cookie into the clipboard, get from clipboard again and check.
            var originalCookie = FBTestFireCookie.getCookieByName(panelNode, "CopyPasteCookie");
            FBTest.ok(originalCookie, "There must be 'CopyPasteCookie'.");
            if (!originalCookie)
                return FBTestFirebug.testDone();

            // Helper shortcut
            var CookieRow = FW.Firebug.FireCookieModel.Templates.CookieRow;

            // Copy & Paste
            CookieRow.onCopy(originalCookie);
            CookieRow.onPaste(null);

            // Check the new cookie
            var newCookie = FBTestFireCookie.getCookieByName(panelNode, "CopyPasteCookie-1");
            FBTest.ok(newCookie, "There must be 'CopyPasteCookie-1'.");
            if (!originalCookie || !newCookie)
                return FBTestFirebug.testDone();

            FBTest.compare(originalCookie.value, newCookie.value, "The value must be the same.");
            FBTest.compare(originalCookie.isDomain, newCookie.isDomain, "The isDomain must be the same.");
            FBTest.compare(originalCookie.host, newCookie.host, "The host must be the same.");
            FBTest.compare(originalCookie.path, newCookie.path, "The path must be the same.");
            FBTest.compare(originalCookie.isSecure, newCookie.isSecure, "The isSecure must be the same.");
            FBTest.compare(originalCookie.expires, newCookie.expires, "The expires must be the same.");
            FBTest.compare(originalCookie.isHttpOnly, newCookie.isHttpOnly, "The isHttpOnly must be the same.");
            FBTest.compare(originalCookie.rawValue, newCookie.rawValue, "The rawValue must be the same.");

            // Delete the cookie
            CookieRow.onRemove(newCookie);
            newCookie = getCookieByName(panelNode, "CopyPasteCookie-1");
            FBTest.ok(!newCookie, "There must not be 'CopyPasteCookie-1'.");

            return FBTestFirebug.testDone("cookies.test.cookiePaste; DONE");
        });
    });
};
