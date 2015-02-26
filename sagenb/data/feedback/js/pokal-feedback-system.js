/**
 * The POKAL Feedback System, POTT #984
 * Based on another feedback.js system (not the ILIAS one)
 * 
 * This system is capable of making a screenshot of the website, let the user
 * highlight and shade out parts of it, write some text and send the whole
 * data via a POST request to the server.
 * 
 * On server side, data are forwarded via Mail and pushed to our bugtracker.
 **/

// pof = pokalfeedback
pof = {};
pof.settings = {
	// path to the feedback folder
	path: '/data/feedback/',
};

pof.setup = function() {
	$('#start_feedback, .start_feedback').click(pof.start_feedback);
};

pof.start_feedback = function() {
	// show the spinner (ripped from worksheet.js:705)
	if(window.sagenb) sagenb.start_loading();
	
	// TODO while developing, turn off caching (turn on lateron!)
	$.ajaxSetup({ cache: false });
	
	// use promises for loading multiple ressources
	// http://stackoverflow.com/questions/11803215/how-to-include-multiple-js-files-using-jquery-getscript-method
	$.when(
		$.getScript(pof.settings.path+"/js/feedback.js"),
		$.get(pof.settings.path+"/html/windows.html", function(data){
			// create invisible DOM from file containing the templates
			pof.template_file = $('<html/>').html(data);
			// extract the templates. They will be plain text strings.
			pof.templates = {};
			$("section", pof.template_file).each(function(){
				// if there is no sagenb-context, try to disable the buttons
				if(!window.sagenb) {
					$(this).find("input[type=checkbox]").prop('checked', false).attr('disabled',true);
				}

				pof.templates[this.id] = $(this).html();
			});
		}),
		$.getScript(pof.settings.path+"/js/html2canvas.js"),
		$.Deferred(function(deferred){ $( deferred.resolve ); })
	).then(function(){
		// hide the spinner
		if(window.sagenb) sagenb.done_loading();
		
		// start the feedback system
		$.feedback({
			ajaxURL: '/post-feedback',
			html2canvasURL: '/data/feedback/js/html2canvas.js',
			tpl: pof.templates,
			fillupPost: function(post) {
				$.each(pof.data_collector, function(key, func) {
					// fixme: The checkbox disabling does not work that well. that is, it does not work.
					if(!window.sagenb) return;

					var checkbox = $("#"+key);
					if(checkbox.length && !checkbox.prop('checked'))
						// Wert ueberspringen
						return;
					
					$.extend(post, func());
					// flat instead of nested:
					//post[key] = func();
				});
				
				return post;
			}			
		});
		
	}, function() {
		//  hide the spinner
		if(window.sagenb) sagenb.done_loading();
		alert("Failed to load feedback system. Everything is broken. My pleasure!");
	})
};

// this corresponds to the checkboxes with class="feedback-data-collector" in the windows.html template
// the key in the data_collector hash corresponds with the checkbox id, while the value is a function
// giving back the collected data.
pof.data_collector = {};

pof.data_collector["feedback-username"] = function() {
	var data = {};

	// the sage user name
	data.username = sagenb.username;
	data.nickname = sagenb.nickname;
	return data;
};

pof.data_collector["feedback-chat-content"] = function() {
	var data = {};
	
	data.chat_nicknames = sagenb.chat.nicknames;
	data.chat_nicknames_count = sagenb.chat.nicknames.length;
	data.chat_messages = "<html><title>Chatauszug<body><meta charset='utf-8'><h1>Chatauszug</h1>"+
		sagenb.chat.message_area.html();		
	data.chat_messages_count = sagenb.chat.message_area.find("p").length;
	return data;
};

pof.data_collector["feedback-worksheet-content"] = function() {
	var data = {};
	
	// ein paar "lesbare" Informationen aus dem Worksheet extrahieren.
	
	var w = sagenb.worksheetapp.worksheet; // shorthand
	var fields = "filename name owner is_evaluating_all is_published published_id_number published_time published_urls";
	$.each(fields.split(/\s/), function(idx,k) { data["worksheet_"+k] = w[k] });
	
	// Make a nice HTML table from the cell data instead of json data
	/*
	data.cells = [];
	$.each(w.cells, function(idx,c) { data.cells.push({ input: c.input, output: c.output }); });
	*/
	data.cells = '<html><title>Worksheet-Auszug</title><meta charset="utf-8"><body><h1>Worksheet-Auszug</h1><table>';
	data.cells += "<tr><th>Cell</th><td>Input</td><td>Output</td></tr>";
	$.each(w.cells, function(idx,c) {
		data.cells += "<tr><th>Cell {0}</th><td><pre>{1}</pre></td><td><pre>{2}</pre></td></tr>".format(
			c.id, c.input, c.output);
	});
	data.cells += "</table>";
	data.cells_count = w.cells.length;
	
	return data;       
};

$(pof.setup);

// JS sprintf:
// "{0} is dead, but {1} is alive! {0} {2}".format("ASP", "ASP.NET")
if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}
