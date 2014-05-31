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

	
        // header button
        sagenb.chat.header_button = $("#worksheet_chat_bar").html(
            '<div class="btn-group pull-right nav">' +
                '<a class="btn dropdown-toggle" data-toggle="dropdown" href="#">' +
                '<i class="icon-comment"></i>&nbsp;<span>Chat</span>' +
                //'<span class="caret"></span>' +
                '</a>' +
            '</div>'
        ).find('.btn').click(sagenb.chat.toggle);
	
        sagenb.chat.message_box = $('<div id="chat_message_box"/>');

	sagenb.chat.message_box.appendTo("body");
        sagenb.chat.dialog = sagenb.chat.message_box.dialog({
            autoOpen: false,
            dialogClass: "chat",
            height: 400,
            width: 240,
            position: { my: "right top", at: "right bottom"},
            show: "fast",
            title: "Worksheet - Chat",
	    // Hacky: diese buttons sind nur farce, um die Pane zu kriegen.
	    // Es wird dann ein eigener Bootstrap-layouteter button hinzugefuegt
	    buttons: [ { text: "Senden", click: sagenb.chat.send_message }  ],
	    // event handler um den richtigen sync zu kriegen zum top button
	    close: function(e,ui) { sagenb.chat.header_button.removeClass("active"); },
	    open: function(e,ui) { sagenb.chat.header_button.addClass("active"); },
        });
	
	$(".chat").find(".ui-dialog-titlebar").after('<div id="chat_userlist_box"></div>');
	sagenb.chat.userlist_box = $("#chat_userlist_box");
	$(".chat").find(".ui-dialog-buttonpane").prepend('<textarea id="chat_input_text"></textarea>');
	sagenb.chat.input_area = $("#chat_input_text");
	
	// keypress handling
	sagenb.chat.input_area.keypress(function(e) {
		if(e.which == 13) { // newline pressed
			sagenb.chat.send_message();
			return false; // zeichen nicht weitergeben und damit nicht darstellen.
		}
	});
	
	// jqueryUI-Button durch Twitter button ersetzen
	$(".chat").find(".ui-dialog-buttonset").remove();
	$(".chat").find(".ui-dialog-buttonpane").append('<button class="btn btn-small" type="button">Senden</button>').click(sagenb.chat.send_message);
	
	// Log into chat
	sagenb.chat.socket.emit('join', {'worksheet': worksheet.filename, 'nickname': sagenb.username});
	/*
	sagenb.chat.socket.on('connect', function (){
		sagenb.chat.socket.emit('join', worksheet.filename);
		sagenb.async_request(worksheet.worksheet_command('get_username'), function(status, response){
			sagenb.chat.socket.emit('nickname_join', response);
		});
	});
	*/
};

sagenb.chat.toggle = function() {
	sagenb.chat.message_box.dialog( sagenb.chat.header_button.hasClass("active") ? "close" : "open");
	$(this).blur(); // FIXME klappt nicht gut
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
	sagenb.chat.userlist_box.html('<b>Mitarbeiter:</b> ' + $.map(nicknames, function(x){ return sagenb.chat.colorize_nickname(x); }).join(", "));
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
	sagenb.chat.append_message("meta join", '<b>'+sagenb.chat.colorize_nickname(user)+'</b> joined');
}

sagenb.chat.on_leave_message = function(user) {
	user = $.parseJSON(user);
	sagenb.chat.append_message("meta leave",'<b>'+sagenb.chat.colorize_nickname(user)+'</b> left');
}

sagenb.chat.append_message = function(classes, text) {
	// scroll to end if user was already at end
	//user_was_at_bottom = (sagenb.chat.message_box.scrollTop() == sagenb.chat.message_box[0].scrollHeight - sagenb.chat.message_box.height());
	// TODO: This check doesnt work yet
	user_was_at_bottom = true

	// push content and store the line element it for return
	message = $('<p class="line '+classes+'">'+text+'</p>').appendTo(sagenb.chat.message_box);

	if(user_was_at_bottom)
		// user was already at bottom -.-
		sagenb.chat.message_box[0].scrollTop = sagenb.chat.message_box[0].scrollHeight;
	
	return message;
}