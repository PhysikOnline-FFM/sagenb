/*global $, alert, async_request, clearTimeout, confirm, document, escape, location, navigator, open, prompt, setTimeout, window, worksheet_filenames */
/*jslint maxerr: 10000, white: true, onevar: true, undef: true, nomen: true, eqeqeq: true, plusplus: true, bitwise: true, regexp: true, strict: true, newcap: true, immed: true */
//'use strict';

{# If you add any new strings to this list, please also add them to translated-messages.js. This indirection and duplication
 is in place because pybabel cannot parse this Jinja for some reason. #}

function gettext(str) {
	var translations = {
		{% for string in [
							'Your browser / OS combination is not supported.\\nPlease use Firefox or Opera under Linux, Windows, or Mac OS X, or Safari.',
							'Java Applet Hidden',
							'Click here to pop out',
							'Error applying function to worksheet(s).',
							'Title of saved worksheet',
							'Failed to save worksheet.',
							'Rename worksheet',
							'Please enter a name for this worksheet.',
							'Rename',
							'Possible failure deleting worksheet.',
							'unprinted',
							'You requested to evaluate a cell that, for some reason, the server is unaware of.',
							'Error',
							'This worksheet is read only. Please make a copy or contact the owner to change it.',
							'loading...'
							'Error updating cell output after ',
							's (canceling further update checks).',
							'Problem inserting new input cell after current input cell.\\n',
							'Worksheet is locked. Cannot insert cells.',
							'Unable to interrupt calculation.',
							'Close this box to stop trying.',
							'Interrupt attempt',
							'<a href="javascript:restart_sage();">Restart</a>, instead?',
							'Emptying the trash will permanently delete all items in the trash. Continue?',
							'Get Image',
							'Jmol Image',
							'To save this image, you can try right-clicking on the image to copy it or save it to a file, or you may be able to just drag the image to your desktop.',
							'Sorry, but you need a browser that supports the &lt;canvas&gt; tag.',
							'Login',
							'Home',
							'Published',
							'Log',
							'Settings',
							'Sign out',
							'SAGE / POKAL Support',
							'Help',
							'Report a Problem',
							'collaborators',
							'Evaluate',
							'Show Static Image',
							'Popout',
							'Open Interactive View',
							'Untitled',
							'Are you sure you would like to interrupt the running computation?',
							'Copy to clipboard: ',
							'running',
							'other(s)',
							'ago',
							'Emptying the Trash is final. Are you sure?',
							'Nothing here!',
							'My Notebook',
							'Published Worksheets',
							'Active',
							'Active Worksheets',
							'Archive',
							'Archived Worksheets',
							'Trash',
							'Deleted Worksheets',
							'Search',
							'close',
							'open',
							'Open chat',
							'Chat',
							'chat',
							'Worksheet - Chat',
							'Send',
							'send',
							'joined',
							'left',
							'Message from',
							'and',
							' is working on this cell. Therefore it has been locked.',
							'unpublish',
							'Publish this worksheet',
							'Get Path',
							'get path',
							'send via chat',
							'Edit',
							'edit',
							'Download',
							'download',
							'Delete',
							'delete',
							'No uploaded files',
							'Remove from POAK',
							'Generate new link',
							'Submit to POAK',
							'Upload started',
							'File upload has been initialized in background',
							'Upload successful',
							'File is ready for use now',
							'show',
							'Upload aborted',
							'An error occured during file upload',
							'Add new tag',
							'Load all previous messages',
							'Folder',
							'Apply to selected worksheets',
							'is online now',
							'has left',
							
						 ] %}
		'{{ string }}' : '{{ gettext(string) }}',
		{% endfor %}
		1 : {
			{% for string in ['Trying again in %(num)d second...'] %}
			'{{ string }}' : function (n) {return '{{ ngettext(string, string, 1) }}'.replace('%(num)d', 1)} {% if not loop.last %},{% endif %}
			{% endfor %}
		},
		2: {
			{% for pair in [['Trying again in %(num)d second...', 'Trying again in %(num)d seconds...']] %}
			'{{ pair[0] }}' : function (n) {return '{{ ngettext(pair[1], pair[1], 2) }}'.replace('%(num)d', n)} {% if not loop.last %},{% endif %}
			{% endfor %}
		}
	};

	if(str in translations) {
		return translations[str];
	}
	return str;
}
