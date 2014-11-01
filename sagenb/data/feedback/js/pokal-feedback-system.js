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
	// path to the scripts folder
	path: '/data/feedback/js',
};

pof.setup = function() {
	$('#start_feedback, .start_feedback').click(pof.start_feedback);
};

pof.start_feedback = function() {
	// show the spinner (ripped from worksheet.js:705)
	sagenb.start_loading();
	$.getScript(pof.settings.path+"/feedback.js", function() {
		// hide the spinner
		sagenb.done_loading();
		
		$.feedback({
			ajaxURL: '/post-feedback',
			html2canvasURL: '/data/feedback/js/html2canvas.js'
		});
	});
	
	
};

$(pof.setup);
