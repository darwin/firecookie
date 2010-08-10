function runTest()
{
    FBTest.sysout("cookies.test.issue25; START");

    FBTestFirebug.openNewTab(basePath + "issue25/issue25.php", function(win)
    {
        FBTestFireCookie.enableCookiePanel(function(win) 
        {
            var cookie = null;
            var panelNode = FBTestFirebug.selectPanel("cookies").panelNode;

            cookie = FBTestFireCookie.getCookieByName(panelNode, "TestCookie25");
            if (!verifyCookie(cookie))
                return testDone();

            editCookie(cookie, true);
            FBTest.ok(!cookie.cookie.expires, "Must be Session cookie now.");

            cookie = FBTestFireCookie.getCookieByName(panelNode, "TestCookie25");
            if (!verifyCookie(cookie))
                return testDone();

            editCookie(cookie, false);
            FBTest.ok(cookie.cookie.expires, "Must not be Session cookie now.");

            cookie = FBTestFireCookie.getCookieByName(panelNode, "TestCookie25");
            if (!verifyCookie(cookie))
                return testDone();

            return testDone("cookies.test.issue25; DONE");
        });
    });
};

function verifyCookie(cookie)
{
    FBTest.ok(cookie, "Cookie must exist.");
    return (cookie ? true : false);
}

function editCookie(cookie, session)
{
    return FBTestFireCookie.editCookie(cookie, function(dialog) {
        dialog.EditCookie.sessionNode.checked = session
        dialog.EditCookie.onOK();
    });
}

function testDone(message)
{
    return FBTestFirebug.testDone(message);
}
