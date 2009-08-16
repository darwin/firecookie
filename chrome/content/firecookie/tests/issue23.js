var currentBaseURI = null;

function runTest()
{
    FBTest.sysout("cookies.test.issue23; START");
    FBTest.loadScript("env.js", this);

    currentBaseURI = FW.FBL.makeURI(basePath);
    FBTest.sysout("cookies.test.issue23: current baseURI " + basePath, currentBaseURI);

    FBTestFireCookie.removeCookie(currentBaseURI.host, "TestCookie23", "/");
    FBTestFirebug.clearCache();

    FBTestFirebug.openNewTab(basePath + "issue23/issue23.php", function(win)
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

    var host = currentBaseURI.host;

    FBTest.sysout("cookies.test.issue23; this is our cookie", cookie);
    FBTest.compare(host, cookie.cookie.host, "Check cookie host.");

    // Open editCookie.xul dialog and edit the value.
    FBTest.sysout("cookies.test.issue23; let's edit an existing cookie");
    return FBTestFireCookie.editCookie(cookie, function(dialog) {
        dialog.EditCookie.valueNode.value = cookie.cookie.value + "-modified";
        dialog.EditCookie.onOK();
    });
}
