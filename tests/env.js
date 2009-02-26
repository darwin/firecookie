/* See license.txt for terms of usage */

var FBTestFireCookie = FBTest.FireCookie = 
{
// ************************************************************************************************
// Firecookie specific APIs

enableCookiePanel: function(callback)
{
    FBTestFirebug.updateModelPermission(FW.Firebug.FireCookieModel, callback, "enable");
}

// ************************************************************************************************
};
