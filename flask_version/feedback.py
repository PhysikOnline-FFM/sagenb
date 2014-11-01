#
# POKAL Feedback/error reporting handling
#

from flask import Flask, Module, url_for, render_template, request, session, redirect, g, make_response, current_app
from sagenb.notebook.misc import encode_response

def handle_feedback():
	print "Hi from the feedback function"
	print request.args
	
	res = make_response("Hallo! Toll!" + str(request.args))
	res.headers['Content-Type'] = 'text/plain'
	
	# um auf POST-Argumente zuzugreifen:
	# request.form.get('key')
	
	return res