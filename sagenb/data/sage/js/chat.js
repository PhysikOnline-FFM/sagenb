/**
 * Chat integration for SageNB over Socket.io
 * POKAL Project 2013
 *
 * Daniel, Philip, Sven
 **/

// namespace (was: _this.chat in sagenb.worksheetapp.worksheet)
sagenb.chat = {};


sagenb.chat.init = function(worksheet) {
	// socket speichern
	sagenb.chat.socket = worksheet.socket;
	
	// chat related things
	chat_messages = ['new_nickname_list', 'user_message', 'join_message', 'leave_message'];
	$.each(chat_messages, function(){ sagenb.chat.socket.on(this, sagenb.chat["on_"+this]); });

	// header (=navigation) button
	sagenb.chat.header_button = $('<li><a href="#chat_window"><span class="glyphicon glyphicon-comment"></span>&nbsp;<span>'+gettext('Chat')+'</span></a></li>');
	sagenb.chat.header_button.find('a').click(sagenb.chat.toggle);
	// put it next to the user button
	$("#user_navbar_area").find("ul.nav").prepend(sagenb.chat.header_button);
    
	// Die Gesamt-Chat-Box (in etwa das, was es vorher war)
	sagenb.chat.message_box = $("#chat-message-box");
	// Header und footer...
	sagenb.chat.message_box_heading = sagenb.chat.message_box.find('.panel-heading');
	sagenb.chat.message_box_footer  = sagenb.chat.message_box.find('.panel-footer');
	// Die box im Chatmessage-Fenster wo der chat reinkommt.
	sagenb.chat.message_area = $("#chat-message-box .message_area"); //$('<div id="chat_message_box"/>');
	// Die Box mit der Userliste:
	sagenb.chat.userlist_box = $("#chat_userlist_box");
	// Das textarea
	sagenb.chat.input_area = $("#chat_input_text");
	// keypress handling
	sagenb.chat.input_area.keypress(function(e) {
		if(e.which == 13) { // newline pressed
			sagenb.chat.send_message();
			return false; // zeichen nicht weitergeben und damit nicht darstellen.
		}
	});
	// Der Absenden-Button
	$("#chat_send_button").click(sagenb.chat.send_message);
	
	// Großer Aufwand, um die Breite nicht berechnen zu muessen (wie bei position:fixed/absolute bzw .affix)
	$(window).scroll(sagenb.chat.window_scroll_helper);
	sagenb.chat.window_scroll_helper();
	sagenb.chat.message_box.addClass('pseudo_fixed');

	// Log into chat
	sagenb.chat.socket.emit('join', {'worksheet': worksheet.filename, 'nickname': sagenb.nickname});
};

sagenb.chat.alert = function(text) {
	// show an alert in the sagenb twitter booostrap alert region.
	if(!$("#user_chat_alert").length) {
		// create the alert box
		sagenb.chat.alert_box = $('<div class="alert alert-info" id="user_chat_alert">' + 
			'<button type="button" class="close" data-dismiss="alert">&times;</button>' +
			'<span class="alert-content"></span>'+
			'<a class="btn primary btn-small open-chat" style="float:right"><i class="icon-comment"></i>&nbsp;'+gettext('Open chat')+'</a>' +
		'</div>').appendTo(".alert_container_inner");
        
		sagenb.chat.alert_box.find('.open-chat').click(function(){
			sagenb.chat.chat.show_chat_box();
			sagenb.chat.alert_box.fadeOut(1); // aka hide()
		});
		
	}
	
	sagenb.chat.alert_box.fadeIn(200); // fade in
	sagenb.chat.alert_box.find(".alert-content").html(text);
	sagenb.chat.alert_box.delay(6000).fadeOut(500); // fade out
};

sagenb.chat.toggle = function() {
	// Testweise aus...
	//sagenb.chat.message_box.dialog( sagenb.chat.header_button.hasClass("active") ? 'close' : 'open');

	// testweise alternativ: Die Seitenleiste auf/einklappen.
	if(sagenb.chat.is_open())
		sagenb.chat.hide_chat_box();
	else	sagenb.chat.show_chat_box();
	
	return false; // nicht aktiv werden (der link)
}

sagenb.chat.is_open = function() {
	return sagenb.chat.header_button.hasClass("active");
}

// for jQueryUI SwitchClass call in {show,hide}_chat_box.
sagenb.chat.switchInOutOptions = {
	'duration': 400,
//	'easing': 'easeInSine',
}

sagenb.chat.hide_chat_box = function() {
	// hide chat box
	$(".the_page_container").switchClass('col-md-8', 'col-md-12');//, sagenb.chat.switchInOutOptions);
	$(".chat-message-box-container").switchClass('col-md-4', 'col-md-0');//, sagenb.chat.switchInOutOptions);
	sagenb.chat.header_button.removeClass("active");
}

sagenb.chat.show_chat_box = function() {
	// show chat box
	sagenb.chat.window_scroll_helper();
	$(".the_page_container").switchClass('col-md-12', 'col-md-8');//, sagenb.chat.switchInOutOptions);
	$(".chat-message-box-container").switchClass('col-md-0', 'col-md-4');//, sagenb.chat.switchInOutOptions);
	sagenb.chat.header_button.addClass("active");
}

sagenb.chat.send_message = function() {
	if((v = sagenb.chat.input_area.val()) != '') {
		// TODO: Notebook-Objekt bekommen!
		sagenb.chat.socket.emit('user message', v);
		sagenb.chat.input_area.val('').focus();
	}
};

sagenb.chat.colorize_nickname = function(user, suffix) {
	name = user['nickname']
	color = user['color']
	return '<span class="nickname" style="color:'+color+'">'+name+(suffix ? suffix : '')+'</span>';
};

/**
 * Websocket Message: Update nickname list
 * @arg nicknames array of user object
 **/
sagenb.chat.on_new_nickname_list = function(nicknames) {
	nicknames = $.parseJSON(nicknames);
	// the storage is currently used only for debugging
	sagenb.chat.nicknames = nicknames;
	// nutze colorize_nickname als callback. da $.map ihm aber zwei parameter zuweist,
	// im zweiten den Index, wird sowas wie "username1", "username2" concatenated als suffix.
	// das ist eigentlich nicht schlimm, sondern witzigerweise sogar wuenschenswert.
	sagenb.chat.userlist_box.html('<b>'+gettext('collaborators')+':</b> ' + $.map(nicknames, function(x){ return sagenb.chat.colorize_nickname(x); }).join(", "));
};

/**
 * Websocket Message: New chat message
 * @arg msg Message as a string (TODO: dirty!)
 **/
sagenb.chat.on_user_message = function(data) {
	data = $.parseJSON(data);
	message = sagenb.chat.append_message("",'<b>'+sagenb.chat.colorize_nickname(data.user, ":")+'</b> <span class="message chat-math">'+data.message+'</span>');
	
	// enable MathJax/LaTex on output
	MathJax.Hub.Queue(["Typeset", MathJax.Hub, $(".chat-math", message)[0]]);
};

sagenb.chat.on_join_message = function(user) {
	user = $.parseJSON(user);
	sagenb.chat.append_message("meta join", '<b>'+sagenb.chat.colorize_nickname(user)+'</b> ist beigetreten.');
}

sagenb.chat.on_leave_message = function(user) {
	user = $.parseJSON(user);
	sagenb.chat.append_message("meta leave",'<b>'+sagenb.chat.colorize_nickname(user)+'</b> ist gegangen.');
}

sagenb.chat.append_message = function(classes, text) {
	// scroll to end if user was already at end
	//user_was_at_bottom = (sagenb.chat.message_box.scrollTop() == sagenb.chat.message_box[0].scrollHeight - sagenb.chat.message_box.height());
	// TODO: This check doesnt work yet
	user_was_at_bottom = true

	// push content and store the line element it for return
	message = $('<p class="line '+classes+'">'+text+'</p>').appendTo(sagenb.chat.message_area);

	if(user_was_at_bottom)
		// user was already at bottom -.-
		sagenb.chat.message_area[0].scrollTop = sagenb.chat.message_area[0].scrollHeight;
	
	if(!sagenb.chat.is_open) {
		// message dialog not open, show a notificiation
		sagenb.chat.alert(text);
	}
	
	return message;
}

sagenb.chat.box_positioning = function() {
	// Layout-"Affix" (Mitscrollen/volle Höhe) des Chats
	sagenb.chat.message_box.addClass('fixed').css({
		'position': 'fixed',
		'width': (sagenb.chat.message_box.parent().width()+15)+"px", // 15px padding right...
		'top': "65px",
		'bottom': '10px',
	});
	
}

sagenb.chat.window_scroll_helper = function() {
		$win = $(window);
		// Messagebox-Position = fixed
		sagenb.chat.message_box.css('top', $win.scrollTop()+"px");
		// Messagebox-Größe = Fenstergröße
		var mbox_height = ($win.innerHeight() - 15 - (sagenb.chat.message_box.offset().top-$win.scrollTop()));
		sagenb.chat.message_box.css('height', mbox_height + "px");
		// panel-body setzen
		var marea_height = mbox_height - sagenb.chat.message_box_heading.outerHeight() - sagenb.chat.message_box_footer.outerHeight();
		sagenb.chat.message_area.css('height', marea_height + "px");
}

// Brauchts nicht mehr
/*
// Chat movement while SCROLLING
$(window).scroll(function(){
	//Animated version (The number specifies the duration of the animation in ms)
	//$(".chat").stop().animate({"marginTop": ($(window).scrollTop()) + "px", "marginLeft":($(window).scrollLeft()) + "px"}, 1500 );
	
	//Non-Animated version
	$(".chat").css({"margin-top": ($(window).scrollTop()) + "px", "margin-left":($(window).scrollLeft()) + "px"});
});
*/