/* The general Sage Notebook javascript "namespace"
 * and object. 
 * 
 * AUTHORS - Samuel Ainsworth (samuel_ainsworth@brown.edu)
 */

// the sagenb "namespace"
var sagenb = {};

sagenb.init = function() {
	// update username
	if(sagenb.username === "guest") {
		$("#user_navbar_area").html('<a href="/login" class="">' + gettext('Login') + '</a>');
	}
	else {
		$("#user_navbar_area").html(
'<a href="#usermenu" class="dropdown-toggle" data-toggle="dropdown">' + 
	'<span class="glyphicon glyphicon-user"></span> <span id="username" class="hidden-sm">' + sagenb.nickname + ' </span>' +
	'<span class="caret"></span>' +
'</a>' +
'<ul class="dropdown-menu" role="menu">' + 
	'<li><a href="/" id="home"><i class="glyphicon glyphicon-home"></i> Mein Notebook </a></li>' +
	'<li><a href="/poak" id="published"><i class="glyphicon glyphicon-cloud"></i> POAK</a></li>' +
	'<li><a href="#" id="log"><i class="glyphicon glyphicon-list"></i> ' + gettext('Log') + '</a></li>' +
//	POTT #984: Move help to more appropriate place!
//	'<li class="nav-header">' + gettext('POKAL Hilfe') + '</li>' +
//	'<li><a href="#" id="help"><i class="icon-book"></i> ' + gettext('Help') + '</a></li>' +
//	'<li><a href="#" id="report_a_problem"><i class="icon-exclamation-sign"></i> ' + gettext('Report a Problem') + '</a></li>' +
	'<li class="divider"></li>' +
	'<li><a href="/settings" id="settings"><i class="glyphicon glyphicon-cog"></i> ' + gettext('Settings') + '</a></li>' +
	'<li><a href="/logout" id="sign_out"><i class="glyphicon glyphicon-off"></i> ' + gettext('Sign out') + '</a></li>' +
'</ul>'
		);
	}
	
	/* swap control/command on mac operating system */
	sagenb.ctrlkey = "Ctrl";
	if(navigator.userAgent.indexOf("Mac") !== -1) {
		sagenb.ctrlkey = "Cmd";
	}
	
	$("#log").click(sagenb.history_window);
	$("#help").click(sagenb.help);
	$(document).bind("keydown", "F1", function(evt) { sagenb.help(); evt.preventDefault(); return false; });
	
	sagenb.spinner = new Spinner();
	
	//// IMPORT DIALOG ////
	$("#import_modal .btn-primary").click(function(e) {
		$("#import_modal .tab-pane.active form").submit();
	});
	$("#import_modal .btn").click(function(e) {
		$.each($("#import_modal form"), function(i, form) {
			form.reset();
		});
	});
};

sagenb.start_loading = function() {
	$(".the_page").fadeTo(0, 0.5);
	sagenb.spinner.spin($("body")[0]);
};
sagenb.done_loading = function() {
	$(".the_page").fadeTo('fast', 1);
	sagenb.spinner.stop();
};

sagenb.show_connection_error = function() {
	$(".alert_connection").show();
};
sagenb.hide_connection_error = function() {
	$(".alert_connection").hide();
};

sagenb.async_request = function(url, callback, postvars) {
    var settings = {
        url: url,
        async: true,
        cache: false,
        dataType: "text"
    };

    if ($.isFunction(callback)) {
        settings.error = function (XMLHttpRequest, textStatus, errorThrown) {
            callback("failure", errorThrown);
        };
        settings.success = function (data, textStatus) {
            callback("success", data);
        };
    }

    if (postvars) {
        settings.type = "POST";
        settings.data = postvars;
    } else {
        settings.type = "GET";
    }

    $.ajax(settings);
}
sagenb.generic_callback = function(extra_callback) {
	/* Constructs a generic callback function. The extra_callback
	* argument is optional. If the callback receives a "success"
	* status (and extra_callback is a function), extra_callback 
	* will be called and passed the status and response arguments.
	* If you use generic_callback with no extra_callback, you *must*
	* call generic_callback() not just generic_callback because 
	* this function is not a callback itself; it returns a callback
	* function.
	*/
	
	return function(status, response) {
		if(status !== "success") {
			sagenb.show_connection_error();
			
			// don't continue to extra_callback
			return;
		} else {
			// status was good, hide alert
			sagenb.hide_connection_error();
		}
	
		// call the extra callback if it was given
		if($.isFunction(extra_callback)) {
			extra_callback(status, response);
		}
	}
};

sagenb.history_window = function() {
    /*
    Display the history popup window, which displays the last few hundred
    commands typed into any worksheet.
    */
    window.open("/history", "", "menubar=1,scrollbars=1,width=800,height=600,toolbar=1,resizable=1");
};

sagenb.help = function(event) {
    /*
    Popup the help window.
    */
	if (event && !event.isDefaultPrevented() ) event.preventDefault();
	
    window.open("/help", "", "menubar=1,location=1,scrollbars=1,width=800,height=650,toolbar=1,resizable=1");
}
