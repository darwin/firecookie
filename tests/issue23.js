function runTest()
{
    FBTest.sysout("cookies.test.issue23; START");
    FBTest.loadScript("env.js", this);

    var baseRemotePath = "http://www.softwareishard.com/firecookie/tests/issue23/";
    FBTestFirebug.openNewTab(baseRemotePath + "issue23.php", function(win)
    {
        FBTestFireCookie.enableCookiePanel(function(win) 
        {
            var panelNode = FBTestFirebug.selectPanel("cookies").panelNode;
            var cookie = FBTestFireCookie.getCookieByName(panelNode, "TestCookie23");

            editCookie(cookie);

            FBTest.compare("ValueCookie23-modified", cookie.cookie.value, "Check new cookie value");
            FBTestFirebug.testDone("cookies.test.issue23; DONE");
        });
    });
};

function editCookie(cookie)
{
    FBTest.ok(cookie, "Cookie must exist.");
    if (!cookie)
        return;

    FBTest.sysout("cookies.test.issue23; this is our cookie", cookie);
    FBTest.compare(".softwareishard.com", cookie.cookie.host, "Check cookie host.");

    // Open editCookie.xul dialog and edit the value.
    FBTest.sysout("cookies.test.issue23; let's edit an existing cookie");
    return FBTestFireCookie.editCookie(cookie, function(dialog) {
        dialog.EditCookie.valueNode.value = cookie.cookie.value + "-modified";
        dialog.EditCookie.onOK();
    });
}
