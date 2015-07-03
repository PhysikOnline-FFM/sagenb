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
	
	// socket: chat related things
	chat_messages = ['new_nickname_list', 'user_message', 'join_message', 'leave_message'];
	$.each(chat_messages, function(){ sagenb.chat.socket.on(this, sagenb.chat["on_"+this]); });

	// header (=navigation) button
	sagenb.chat.header_button = $('<a href="#chat_window"><span class="glyphicon glyphicon-comment"></span>&nbsp;<span class="hidden-sm">'+gettext('Chat')+'</span></a>');
	sagenb.chat.header_button.click(sagenb.chat.toggle);
	// put it next to the user button
	$("#worksheet_chat_bar").prepend(sagenb.chat.header_button);
    
	// Die Gesamt-Chat-Box (in etwa das, was es vorher war)
	sagenb.chat.message_box = $("#chat-message-box");
	// Header und footer...
	sagenb.chat.message_box_heading = sagenb.chat.message_box.find('.panel-heading');
	sagenb.chat.message_box_footer  = sagenb.chat.message_box.find('.panel-footer');
	// Die box im Chatmessage-Fenster wo der chat reinkommt.
	sagenb.chat.message_area = $("#chat-message-box .message_area");
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
	// a nickname list (by default empty - yes, the current user should be included)
	sagenb.chat.nicknames = []
	
	// chat_history - load previous messages from server
	sagenb.chat.load_previous_messages(20, -1);
	
	// Großer Aufwand, um die Breite nicht berechnen zu muessen (wie bei position:fixed/absolute bzw .affix)
	$(window).scroll(sagenb.chat.window_scroll_helper);
	sagenb.chat.window_scroll_helper();
	sagenb.chat.message_box.addClass('pseudo_fixed');

	// Log into chat
	sagenb.chat.socket.emit('join', {'worksheet': worksheet.filename, 'nickname': sagenb.nickname, 'username': sagenb.username});
};

sagenb.chat.alert = function(text) {
	// show an alert in the sagenb twitter booostrap alert region.
	if(!$("#user_chat_alert").length) {
		// create the alert box
		sagenb.chat.alert_box = $('<div class="alert alert-info" id="user_chat_alert">' + 
			'<button type="button" class="close" data-dismiss="alert">&times;</button>' +
			'<span class="alert-content"></span>'+
			'<a class="btn primary btn-xs open-chat" style="float:right"><i class="icon-comment"></i>&nbsp;'+gettext('Open chat')+'</a>' +
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

sagenb.chat.toggle = function(e) {
	e.preventDefault();
	// Testweise aus...
	//sagenb.chat.message_box.dialog( sagenb.chat.header_button.hasClass("active") ? 'close' : 'open');

	// testweise alternativ: Die Seitenleiste auf/einklappen.
	if(sagenb.chat.is_open())
		sagenb.chat.hide_chat_box();
	else 
		sagenb.chat.show_chat_box();
	
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
	sagenb.chat.header_button.removeClass("active").parent().removeClass("active");
}

sagenb.chat.show_chat_box = function() {
	// show chat box
	sagenb.chat.window_scroll_helper();
	$(".the_page_container").switchClass('col-md-12', 'col-md-8');//, sagenb.chat.switchInOutOptions);
	$(".chat-message-box-container").switchClass('col-md-0', 'col-md-4');//, sagenb.chat.switchInOutOptions);
	sagenb.chat.header_button.addClass("active").parent().addClass("active");
}

sagenb.chat.send_message = function() {
	if((v = sagenb.chat.input_area.val()) != '') {
		// TODO: Notebook-Objekt bekommen!
		sagenb.chat.socket.emit('user message', v);
		sagenb.chat.input_area.val('').focus();
	}
};

/**
 * Get previous messages from server chat_history
 * @arg max_num_messages maximum number of messages server shall return (use -1 for all)
 * @arg start_at_msg_id  message id at which server will start to give you the messages (use -1 to begin at last id)
 **/
sagenb.chat.load_previous_messages = function(max_num_messages, start_at_msg_id) {
	var url = sagenb.worksheetapp.worksheet.worksheet_command('chat_history')+'/'+max_num_messages+'/'+start_at_msg_id;
	sagenb.async_request(url, sagenb.generic_callback(function(status, response) {
		if(status == "success") {
			var history = $.parseJSON(response);
			
			// output messages
			if (history.length) {
				// Fill block elements with messages for each day
				$.each(history, function(i,m){
					// add color to msg, get from DOM if exist otherwise black
					var nick_color = $('.nickname.'+m['username']).first();
					if (nick_color)
						m['color'] = nick_color.css('color');
					else
						m['color'] = '#000000';
					
					var loc_date_str = sagenb.chat.getLocaleDateString(m.time, true, false),
						loc_time_str = sagenb.chat.getLocaleDateString(m.time, false, true),
						comp_date_str= sagenb.chat.getComparableDateString(m.time);
					
					sagenb.chat.show_message(m, {'css': "history", 'prepend': true});
				});
				
				// Show button to load all previous messages, if not already done
				if (max_num_messages > 0 && history.length == max_num_messages){
					var btn = $('<button class="btn btn-xs btn-default btn-block text-muted" />')
						.append($('<span class="glyphicon glyphicon-download" />'))
						.append($('<span />').text(' '+gettext('Load all previous messages')));
					btn.click(function(e){
						e.preventDefault(); e.stopPropagation();
						sagenb.chat.load_previous_messages(-1, history[history.length-1].id);
						$(this).remove();
					});
					sagenb.chat.message_area.prepend(btn);
				}
			}
		}
	}));
};

sagenb.chat.getLocaleDateString = function(date_input_string, date, time) {
	if (date_input_string)
		var d = new Date(date_input_string);
	else
		var d = new Date();
		
	var split = d.toLocaleString().split(/\ (.+)/);
	
	if (date && time)
		return split[0] + ' ' + split[1];
	else if (date)
		return split[0];
	else if (time)
		return split[1];
	else
		return null;
}

sagenb.chat.getComparableDateString = function(date_input_string) {
	if (date_input_string)
		var d = new Date(date_input_string);
	else
		var d = new Date();
	
	var yyyy = d.getFullYear().toString(),
		mm = (d.getMonth()+1).toString(), 
		dd = d.getDate().toString();
	return yyyy + '-' + (mm[1]?mm:"0"+mm[0]) + '-' + (dd[1]?dd:"0"+dd[0]);
}

sagenb.chat.colorize_nickname = function(user, suffix, include_previous) {
	if (include_previous) // Colorize all previous messages
		$('span.nickname.'+user['username']).css('color', user['color']);
	return '<span class="nickname '+ user['username'] +'" style="color:'+ user['color'] +'">'+ user['nickname'] +(suffix ? suffix : '')+'</span>';
};

/**
 * Websocket Message: Update nickname list
 * @arg nicknames array of user object
 **/
sagenb.chat.on_new_nickname_list = function(nicknames) {
	nicknames = $.parseJSON(nicknames);
	//console.log('sagenb.chat.on_new_nickname_list()', nicknames);
	// update the global storage (used for various purposes, like feedback)
	sagenb.chat.nicknames = nicknames;
	// nutze colorize_nickname als callback. da $.map ihm aber zwei parameter zuweist,
	// im zweiten den Index, wird sowas wie "username1", "username2" concatenated als suffix.
	// das ist eigentlich nicht schlimm, sondern witzigerweise sogar wuenschenswert.
	sagenb.chat.userlist_box.html('<b>'+gettext('collaborators')+':</b> ' + $.map(nicknames, function(x){ return sagenb.chat.colorize_nickname(x, undefined, true); }).join(", "));
};

/**
 * Websocket Message: New chat message
 * @arg msg Message as a string (TODO: dirty!)
 **/
sagenb.chat.on_user_message = function(data) {
	data = $.parseJSON(data);
	sagenb.chat.show_message(data);
	
	// enable MathJax/LaTex on output
	MathJax.Hub.Queue(["Typeset", MathJax.Hub, $(".chat-math", data.msg)[0]]);
};

sagenb.chat.on_join_message = function(user) {
	user = $.parseJSON(user);
	$.extend(user, {'msg': gettext('is online now'), 'time': (new Date()).toISOString()});
	sagenb.chat.show_message(user, {'css': 'meta join text-right', 'nickname_suffix':''});
}

sagenb.chat.on_leave_message = function(user) {
	user = $.parseJSON(user);
	$.extend(user, {'msg': gettext('has left'), 'time': (new Date()).toISOString()});
	sagenb.chat.show_message(user, {'css': 'meta leave text-right', 'nickname_suffix':''});
}

/**
 * Apply some replacement on the chat message string (such as link to html-link, image to html-image etc.)
 **/
sagenb.chat.replace_stuff_in_msg = function(msg_str){
	// Own Rules
	// Preview images [[data|src_url]]
	msg_str = msg_str.replace(/\[\[(data|img)\|([^\]]+)\]\]/gi, function(str, p1){
		var match_split = p2.split('/');
		// extend url if only filename has been typed (shorthand)
		if (match_split.length == 1){
			p2 = sagenb.worksheetapp.worksheet.worksheet_command("data") +'/'+ p2;
			match_split = p2.split('/'); // repeat this step
		}
			
		var text, filename = match_split.pop();
		// differntiate between image and other file types
		if (filename.match(/\.(jpe?g|png|gif)$/i))
			text = '<img src="'+ p2 +'" title="Diese Datei wurde hochgeladen, um sie dir zu zeigen und steht nun auch unter Daten zur Verfügung." ' 
				+ 'alt="' + filename + ' nicht gefunden..." />';
		else 
			text = filename;
		
		return '<a href="'+ sagenb.worksheetapp.worksheet.worksheet_command("edit_datafile") +'/'+ filename 
				+'" title="Diese Datei wurde hochgeladen, um sie dir zu zeigen und steht nun auch unter Daten zur Verfügung." >'
				+ text + '</a>';
	});
	
	// External Lib 
	$msg = $('<span>').html(msg_str).linkify(); // URL detection and html link convert
	
	return $msg.html();
}

sagenb.chat.show_message = function(msg_obj, options){
	// Expects msg_obj := {'username': 'Username', 'nickname': 'Nickname', 'color': '#124578', 'msg': 'Text', 'time': 'Datetime ISO', 'id':0}
	
	var default_options = {
		'css': null,				// add additional css classes 
		'target_elem': undefined,	// element where message shall be added to. If undefined target element will be choosen automatically.
		'prepend': false, 			// append (false) or prepend (true) message to target element.
		'nickname_suffix' : ':',	// text that will be shown after the nickname automatically.
		},
		line, user_was_at_bottom,	// predefine variables
		opt = $.extend({}, default_options, options); 	// overwrite default_options with options
	
	// Break if no msg_obj is given
	if (!msg_obj) return;
	
	// scroll to end if user was already at end
	//user_was_at_bottom = (sagenb.chat.message_box.scrollTop() == sagenb.chat.message_box[0].scrollHeight - sagenb.chat.message_box.height());
	// TODO: This check doesnt work yet
	user_was_at_bottom = true
	
	// New line
	line = $('<p class="line" />').addClass(opt.css);
	
	// if time is given
	if (msg_obj.time){
		var loc_date_str = sagenb.chat.getLocaleDateString(msg_obj.time, true, false),
			loc_time_str = sagenb.chat.getLocaleDateString(msg_obj.time, false, true),
			comp_date_str= sagenb.chat.getComparableDateString(msg_obj.time),
			clockicon;
		
		clockicon = $('<span class="time fade pull-right text-muted" />')
			.attr({'data-toggle':"tooltip", 'title': loc_date_str+" <br /><b>"+loc_time_str+"</b>"})
			.css({'cursor': 'pointer', 'margin': '0 -12px 0 4px'})
			.html($('<span class="glyphicon glyphicon-time" aria-hidden="true"></span>'));
		
		line.append(clockicon);
		
		// Find target 
		if (!opt.target_elem){
			var existing_block = sagenb.chat.message_area.find('#date_block_'+comp_date_str+' .body');
			if (existing_block.length)
				opt.target_elem = existing_block;
			else {
				var new_block_id = 'date_block_'+comp_date_str, 
					new_block = $('<div class="date_blocks" />').attr('id', new_block_id);
				new_block
					.append($('<div class="head meta date text-center text-muted small" />').html('&mdash;&nbsp;' + loc_date_str + '&nbsp;&mdash;'))
					.append($('<div class="body" />'));
				
				// Put block to the right place (sorted manner)!
				var date_blocks = sagenb.chat.message_area.find('.date_blocks');
				if (date_blocks.length){
					date_blocks.each(function(i, block){
						var block = $(block);
						if (new_block_id < block.attr('id')){
							block.before(new_block);
							return false; // == break
						}
						else if (i == date_blocks.length - 1){
							sagenb.chat.message_area.append(new_block);
						}
					});
				}
				else
					sagenb.chat.message_area.append(new_block);
				
				opt.target_elem = new_block.children('.body');
			}
		}
	}
	else if (!opt.target_elem)
		opt.target_elem = sagenb.chat.message_area;
	
	// (colorized) nickname
	line.append($(sagenb.chat.colorize_nickname(msg_obj, opt.nickname_suffix)).css('font-weight', 'bold'));
	// space
	line.append(" ");
	// message text
	line.append($('<span class="message chat-math" />').html(sagenb.chat.replace_stuff_in_msg(msg_obj.msg)));
	
	// add to DOM
	if (opt.prepend)
		line.prependTo(opt.target_elem);
	else
		line.appendTo(opt.target_elem);
	
	if (user_was_at_bottom){
		// user was already at bottom -.-
		sagenb.chat.message_area[0].scrollTop = sagenb.chat.message_area[0].scrollHeight;
	}
	
	if (!sagenb.chat.is_open) {
		// message dialog not open, show a notificiation
		sagenb.chat.alert(text);
	}
	
	line.find('[data-toggle="tooltip"]').tooltip({'placement':"left", 'html':true});
	return line;
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
