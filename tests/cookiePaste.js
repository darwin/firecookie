function runTest()
{
    FBTest.sysout("cookies.fbtest.cookiePaste; START");
    FBTest.loadScript("env.js", this);

    // Server side handler.
    FBTest.registerPathHandler("/cookiePaste.html", function (metadata, response) 
    {
        FBTest.sysout("cookies.fbtest.cookiePaste; Server side handler executed.");
        response.setHeader("Set-Cookie", 
            "CopyPasteCookie=Test Cookie Value; " +
            "expires=Wed, 01-Jan-2020 00:00:00 GMT; " +
            "path=/dir; " +
            false);
        response.write("<html><head><title>Cookie Copy & Paste</title></head><body>" +
            "<h1>Test for cooki Copy & Paste.</h1>" +
            "</body></html>");
    });

    openURL(basePath + "cookiePaste.html", function(win)
    {
        FBTest.sysout("cookies.fbtest.cookiePaste; Check clipboard functionality");

        // Make sure the Cookie panel's UI is there.
        FW.Firebug.showBar(true);
        var panelNode = FW.FirebugChrome.selectPanel("cookies").panelNode;

        // Copy cookie into the clipboard, get from clipboard again and check.
        var originalCookie = getCookieByName(panelNode, "CopyPasteCookie");
        FBTest.ok(originalCookie, "There must be 'CopyPasteCookie'.");
        if (!originalCookie)
            return testDone();

        // Helper shortcut
        var CookieRow = FW.Firebug.FireCookieModel.Templates.CookieRow;

        // Copy & Paste
        CookieRow.onCopy(originalCookie);
        CookieRow.onPaste(null);

        // Check the new cookie
        var newCookie = getCookieByName(panelNode, "CopyPasteCookie-1");
        FBTest.ok(newCookie, "There must be 'CopyPasteCookie-1'.");
        if (!originalCookie)
            return testDone();

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
        FBTest.ok(!newCookie, "There mus not be 'CopyPasteCookie-1'.");

        return testDone();
    });
};

function getCookieByName(panelNode, cookieName)
{
    var cookieRows = FW.FBL.getElementsByClass(panelNode, "cookieRow");
    for (var i=0; i<cookieRows.length; i++)
    {
        var row = cookieRows[i];
        var label = FW.FBL.getElementsByClass(row, "cookieNameLabel");
        if (label.length != 1)
            return null;

        if (label[0].textContent == cookieName)
            return row.repObject; 
    }
    return null;
}

function testDone()
{
    // Finish test
    FBTest.sysout("cookies.fbtest.cookiePaste; DONE");
    FBTest.testDone();
}
