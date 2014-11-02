# -*- coding: utf-8 -*-
#
# POKAL Feedback/error reporting handling
#
# This python "endpoint" is rather stupid: It basically sends a preformatted email with
# untouched POST files to predefined recipients. This is probably dangorous with the
# HTML content, as it may contain malicious things. But it's the E-mail world, every
# email can contain malicious files.
#
# -- started by Sven, 02.11.2014 for POKAL
#

from flask import Flask, Module, url_for, render_template, request, session, redirect, g, make_response, current_app
from sagenb.notebook.misc import encode_response

# standard python
from base64 import b64decode
from string import Template
from uuid import uuid4
from datetime import datetime

# python email composition utilities
from email.MIMEMultipart import MIMEMultipart
from email.MIMEBase import MIMEBase
from email.MIMEText import MIMEText
from email.MIMEImage import MIMEImage
from email.utils import formataddr, formatdate
emailaddr = lambda x: x[1] # takes last one of tuple (realname, email_address)
from email import Encoders, Charset

# send mails natively with smtplib. Yes, there is
# sagenb.notebook.sage_email, but it uses an internal mail server which is really bad
# for our setup, since POKAL runs an exim instance with satellite configuration to the
# central institute mail server.
import smtplib, os


def handle_feedback():
	userdata = request.get_json(silent=True)
	
	# spamschutz vor Bots, die github durchlesen:
	domain = "."+".".join("de uni-frankfurt physik".split(" ")[::-1])
	from_addr = ("POKAL-Feedback", "no-answer@pokal.uni-frankfurt.de")
	to_addrs = [
		("eLearning", "elearning@th%s" % domain),
		("POTT", "pott@elearning%s" % domain),
	]
	subject = "POKAL Feedback"
	
	# Force python to encode utf-8 as quoted-printable and not base64
	# (both subject and body). unfortunately this modifies a global setting,
	# but email sending in POKAL is not such a popular task yet.
	Charset.add_charset('utf-8', Charset.QP, Charset.QP, 'utf-8')
	
	if userdata:
		# could correctly parse userdata
		output = {'status': 'JSON could be retrieved'}
		output['userdata'] = userdata
		status = 200 # OK
		
		msg = MIMEMultipart()
		msg['From'] = formataddr(from_addr)
		msg['To'] = ", ".join(map(formataddr,to_addrs))
		msg['Date'] = formatdate(localtime=True)
		msg['Subject'] = subject
		msg['Content-Type'] = 'text/html; charset=utf-8'
		
		body = u"""
Ein neuer POKAL-Feedback ist durch das Feedbacksystem (#984) eingereicht worden.

== Vom Besucher ausgefüllter Text ==
$note

== Screenshot ==
[[Image($screenshot_filename, width=100%)]]

== Daten ==

 URL des Worksheets::
    $url
 Name (Titel) des Worksheets::
    ''$worksheet_name''
 HRZ-Username des Benutzers::
    `$username`
 Nickname des Benutzers::
    `$nickname`
 Browser des Benutzers (User Agent)::
    `$HTTP_USER_AGENT`
 IP-Adresse des Besuchers::
    `HTTP_X_FORWARDED_FOR = $HTTP_X_FORWARDED_FOR`
 Verarbeitender POKAL-Server::
    `SERVER_NAME:... = $SERVER_NAME:$SERVER_PORT`
 Zwischenpunkt (Remote IP des bearbeitenden Pokal-Servers)::
    `REMOTE_ADDR = $REMOTE_ADDR`
 Endpunkt POKAL-Host::
    `HTTP_HOST = $HTTP_HOST`
 Uhrzeit::
    $date
 Anzahl Benutzer im Chat::
    $chat_nicknames_count
 Anzahl Chatzeilen::
    $chat_messages_count
 Länge Worksheet (Anzahl Worksheet-Zellen)::
    $cells_count

@type: Designen
@component: POKAL
@keywords: pokal, feedback
@sensitive: 1

"""
		# look at the image
		if "img" in userdata:
			screenshot_filename = "screenshot-%s.png" % str(uuid4())[:6]
			binaryimg = unpack_html2image_screenshot(userdata["img"])
			img_part = MIMEImage(binaryimg)
			img_part.set_param('name', screenshot_filename)
			img_part.add_header('Content-Disposition', 'attachment; filename="%s"' % screenshot_filename)
		else:	screenshot_filename = "<no screenshot present>"
		
		# enrich the data with classical CGI ENV vars
		serverdata = request.environ
		# further data
		furtherdata = {
			"screenshot_filename": screenshot_filename,
			"date": datetime.now().strftime("%c")
		}
		# userdata are overwritten by serverdata
		replace_data = dict(userdata.items() + serverdata.items() + furtherdata.items())
		
		body = Template(body).safe_substitute(replace_data)
		# make sure of a quoted printable body
		msg.attach( MIMEText(body.encode('utf-8'), 'plain', 'utf-8') )
		
		# format the image attachment
		msg.attach(img_part)
		
		# consider also the HTML attachments
		for key in ["cells", "chat_messages"]:
			if not key in userdata:
				continue
			text_part = MIMEText(userdata[key], "text/html", "utf-8")
			text_part.set_param('name', key+".html")
			text_part.add_header('Content-Disposition', 'attachment; filename="%s.html"' % key)
			msg.attach(text_part)		

		try:
			smtp = smtplib.SMTP('localhost')
			smtp.sendmail( emailaddr(from_addr), map(emailaddr, to_addrs), msg.as_string() )
			smtp.close()
			output['status'] = 'Feedback mail successfully sent.'
		except smtplib.SMTPException as e:
			output['status'] =  'Error sending mail: '+str(e)
			status = 502 # bad mail
	else:
		# could not parse userdata, or error, or not given
		output = {'status': 'Error: Please POST valid JSON feedback data.'}
		status = 400 # bad request

	# um auf POST-Argumente zuzugreifen:
	# request.form.get('key')
	
	res = make_response(encode_response(output))
	res.headers['Content-Type'] = 'application/json'
	return res, status

def unpack_html2image_screenshot(b64string):
	"""
	Unpack a base64 encoded canvas website screenshot generated by html2image.
	This was first figured out in the PHP endpoint for the ILIAS feedback form.
	"""
	binaryData = b64decode( b64string[len("data:image/png;base64,"):] )
	return binaryData
	