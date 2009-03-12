function runTest()
{
    FBTest.sysout("cookies.test.issue25; START");
    FBTest.loadScript("env.js", this);

    var baseRemotePath = "http://www.janodvarko.cz/firecookie/tests/issue25/";
    FBTestFirebug.openNewTab(baseRemotePath + "issue25.php", function(win)
    {
        FBTestFireCookie.enableCookiePanel(function(win) 
        {
            var cookie = null;
            var panelNode = FBTestFirebug.selectPanel("cookies").panelNode;

            cookie = FBTestFireCookie.getCookieByName(panelNode, "TestCookie25");
            if (!verifyCookie(cookie))
                return testDone();

            editCookie(cookie, true);

            cookie = FBTestFireCookie.getCookieByName(panelNode, "TestCookie25");
            if (!verifyCookie(cookie))
                return testDone();

            editCookie(cookie, false);
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
