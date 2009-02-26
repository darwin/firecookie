/* See license.txt for terms of usage */

var FBTestFireCookie = FBTest.FireCookie = 
{
// ************************************************************************************************
// Firecookie specific APIs

enableCookiePanel: function(callback)
{
    FBTestFirebug.updateModelPermission(FW.Firebug.FireCookieModel, callback, "enable");
},

getCookieRowByName: function(panelNode, cookieName)
{
    var cookieRows = FW.FBL.getElementsByClass(panelNode, "cookieRow");
    for (var i=0; i<cookieRows.length; i++)
    {
        var row = cookieRows[i];
        var label = FW.FBL.getElementsByClass(row, "cookieNameLabel");
        if (label.length != 1)
            return null;

        if (label[0].textContent == cookieName)
            return row; 
    }
    return null;
},

getCookieByName: function(panelNode, cookieName)
{
    var row = this.getCookieRowByName(panelNode, cookieName);
    return row ? row.repObject : null;
},

// ************************************************************************************************
};
