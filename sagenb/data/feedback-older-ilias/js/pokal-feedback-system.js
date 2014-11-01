/**
 * The POKAL Feedback System, POTT #984
 * Based on feedback.js, html2canvas.js and the ILIAS feedback system made by PhysikOnline.
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
		
		options = {
			h2cPath: pof.settings.path+"/html2canvas.js",
			url: "/not-yet-set-send-me.php",
			appendTo: null, // keinen button erzeugen, der das System erst startet, sondern direkt starten
			label: 'Feedback',
			header: 'Problem berichten',
			nextLabel: 'Weiter',
			reviewLabel: 'Vorschau',
			sendLabel: 'Abschicken',
			closeLabel: 'Schließen',
			messageSuccess: 'Die Meldung wurde abgeschickt',
			messageError: 'Es gab einen Fehler beim Verarbeiten der Daten. Bitte wenden Sie sich stattdessen per E-Mail an uns.'
		};
		options['pages'] = [
			new window.Feedback.Form([
				{
					type: 'textarea',
					name: 'Issue',
					label: 'Blablabla',
					required: false
				}
			]),
			new window.Feedback.Screenshot(options),
			new window.Feedback.Review()
		];
		
		fb = Feedback(options);
		fb.open();
	});
	
	
};

$(pof.setup);