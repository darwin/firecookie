var winWatcher = Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIWindowWatcher);

function runTest()
{
    FBTest.sysout("cookies.test.issue34; START");
    FBTest.loadScript("env.js", this);

    // Server side handler.
    FBTest.registerPathHandler("/issue34.html", function (metadata, response) 
    {
        FBTest.sysout("cookies.test.issue34; Server side handler executed.");
        response.setHeader("Set-Cookie", 
            "TestCookie34=ValueCookie34; " +
            "expires=Wed, 01-Jan-2020 00:00:00 GMT; " +
            "path=/dir; " +
            "domain=.localhost",
            false);
        response.write("<html><head><title>Cookie Entry</title></head><body>" +
            "<h1>Issue 34: firecookie 0.8 cookies with .domain.com the first " +
            "period gets erased on editing any attribute</h1>" +
            "</body></html>");
    });

    FBTestFirebug.openNewTab(basePath + "issue34.html", function(win)
    {
        FBTestFireCookie.enableCookiePanel(function(win) 
        {
            var panelNode = FBTestFirebug.selectPanel("cookies").panelNode;
            var cookie = FBTestFireCookie.getCookieByName(panelNode, "TestCookie34");
            FBTest.ok(cookie, "Cookie 'TestCookie34' must exist.");
            if (!cookie)
                return FBTestFirebug.testDone();

            FBTest.sysout("cookies.test.issue34; this is our cookie", cookie);

            // Check domain
            FBTest.compare(".localhost", cookie.cookie.host, "Check host.");

            // The edit cookie dialog is modal so, we have to register a listener
            // to finish the test. 
            winWatcher.registerNotification(watcherObserver);

            // Open editCookie.xul dialog and edit the value.
            FBTest.sysout("cookies.test.issue34; let's edit an existing cookie");
            FW.Firebug.FireCookieModel.Templates.CookieRow.onEdit(cookie);
            FBTest.sysout("cookies.test.issue34; editCookie.xul closed");

            // Now the dialog has been finished so, check the new value.
            FBTest.compare("NewValueForCookie34", cookie.cookie.value, "Check new cookie value");
            FBTestFirebug.testDone("cookies.test.issue34; DONE");
        });
    });
};

var watcherObserver =
{
    observe: function(subject, topic, data)
    {
        if (topic == "domwindowopened")
        {
            var win = subject.QueryInterface(Ci.nsIDOMWindow);
            setTimeout(function() 
            {
                FBTest.sysout("cookies.test.issue34; editCookie.xul opened", win);
                FBTest.compare("chrome://firecookie/content/editCookie.xul",
                    win.document.location.href, "The window must match");
                FBTest.ok(win.EditCookie, "The EditCookie varible must exist");

                // Change value and finish the dialog.
                win.EditCookie.nameNode.value = "NewValueForCookie34";
                win.EditCookie.onOK();
            }, 200);
            winWatcher.unregisterNotification(watcherObserver);
        }
    }
};
