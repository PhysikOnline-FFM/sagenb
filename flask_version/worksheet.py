import re, os, threading, collections
from functools import wraps
from flask import Module, url_for, render_template, request, session, redirect, g, current_app, make_response, Response
from decorators import guest_or_login_required, login_required, with_lock
from collections import defaultdict
from flask.ext.babel import Babel, gettext, ngettext, lazy_gettext
_ = gettext

from sagenb.notebook.interact import INTERACT_UPDATE_PREFIX
from sagenb.notebook.misc import encode_response
from socketio import socketio_manage
from socketio.namespace import BaseNamespace
from socketio.mixins import RoomsMixin, BroadcastMixin
from gevent import monkey
import gevent
#import smtplib
from models import *
import datetime

monkey.patch_all()

#ws = Module('flask_server.worksheet')
ws = Module('sagenb.flask_version.worksheet')
worksheet_locks = defaultdict(threading.Lock)

def worksheet_view(f):
    """
    The `username` in the wrapper function is the username in the URL to the worksheet, which normally
    is the owner of the worksheet.  Don't confuse this with `g.username`, the actual username of the
    user looking at the worksheet.
    """
    @guest_or_login_required
    @wraps(f)
    def wrapper(username, id, **kwds):
        worksheet_filename = username + "/" + id
        try:
            worksheet = kwds['worksheet'] = g.notebook.get_worksheet_with_filename(worksheet_filename)
        except KeyError:
            return _("You do not have permission to access this worksheet")

        with worksheet_locks[worksheet]:
            owner = worksheet.owner()

            if owner != '_sage_' and g.username != owner:
                if not worksheet.is_published():
                    if (not g.username in worksheet.collaborators() and
                        not g.notebook.user_manager().user_is_admin(g.username)):
                        return current_app.message(_("You do not have permission to access this worksheet"))

            if not worksheet.is_published():
                worksheet.set_active(g.username)

            #This was in twist.Worksheet.childFactory
            from base import notebook_updates
            notebook_updates()

            return f(username, id, **kwds)

    return wrapper

def url_for_worksheet(worksheet):
    """
    Returns the url for a given worksheet.
    """
    return url_for('worksheet.worksheet', username=worksheet.owner(), id=worksheet.filename_without_owner())


def get_cell_id():
    """
    Returns the cell ID from the request.

    We cast the incoming cell ID to an integer, if it's possible.
    Otherwise, we treat it as a string.
    """
    try:
        return int(request.values['id'])
    except ValueError:
        return request.values['id']

##############################
# Views
##############################
@ws.route('/new_worksheet')
@login_required
def new_worksheet():
    if g.notebook.readonly_user(g.username):
        return current_app.message(_("Account is in read-only mode"), cont=url_for('worksheet_listing.home', username=g.username))

    W = g.notebook.create_new_worksheet(gettext("Untitled"), g.username)

    # add worksheet to the database
    #newDBWorksheet(g.db, W)
    #g.db.commit()

    return redirect(url_for_worksheet(W))

@ws.route('/home/<username>/<id>/')
@worksheet_view
def worksheet(username, id, worksheet=None):
    """
    username is the owner of the worksheet
    id is the id of the worksheet
    """
    # /home/pub/* is handled in worksheet_listing.py
    assert worksheet is not None
    worksheet.sage()
    return render_template(os.path.join('html', 'worksheet.html'))

    published_commands_allowed = set(['alive', 'cells', 'cell_update',
                              'data', 'download', 'edit_published_page', 'eval',
                              'quit_sage', 'rate', 'rating_info', 'new_cell_before',
                              'new_cell_after', 'introspect', 'delete_all_output',
                              'copy', 'restart_sage'])

    readonly_commands_allowed = set(['alive', 'cells', 'data', 'datafile', 'download', 'quit_sage', 'rating_info', 'delete_all_output'])

def worksheet_command(target, **route_kwds):
    if 'methods' not in route_kwds:
        route_kwds['methods'] = ['GET', 'POST']

    def decorator(f):
        @ws.route('/home/<username>/<id>/' + target, **route_kwds)
        @worksheet_view
        @wraps(f)
        def wrapper(*args, **kwds):
            #We remove the first two arguments corresponding to the
            #username and the worksheet id
            username_id = args[:2]
            args = args[2:]

            #####################
            # Public worksheets #
            #####################
            #_sage_ is used by live docs and published interacts
            if username_id and username_id[0] in ['_sage_']:
                if target.split('/')[0] not in published_commands_allowed:
                    raise NotImplementedError("User _sage_ can not access URL %s"%target)
            if g.notebook.readonly_user(g.username):
                if target.split('/')[0] not in readonly_commands_allowed:
                    return current_app.message(_("Account is in read-only mode"), cont=url_for('worksheet_listing.home', username=g.username))

            #Make worksheet a non-keyword argument appearing before the
            #other non-keyword arguments.
            worksheet = kwds.pop('worksheet', None)
            if worksheet is not None:
                args = (worksheet,) + args

            return f(*args, **kwds)

        #This function shares some functionality with url_for_worksheet.
        #Maybe we can refactor this some?
        def wc_url_for(worksheet, *args, **kwds):
            kwds['username'] = g.username
            kwds['id'] = worksheet.filename_without_owner()
            return url_for(f.__name__, *args, **kwds)

        wrapper.url_for = wc_url_for

        return wrapper
    return decorator


@worksheet_command('rename')
def worksheet_rename(worksheet):
    wsname = request.values['name']
    try:
        if g.username == worksheet.owner():
            worksheet.set_name(wsname)

        # update database
        #getDBWorksheet(g.db, worksheet).name = wsname
        #g.db.commit()
    except:
        print "DB Error during renaming of worksheet!"

    return 'done'

@worksheet_command('alive')
def worksheet_alive(worksheet):
    return str(worksheet.state_number())

@worksheet_command('system/<system>')
def worksheet_system(worksheet, system):
    worksheet.set_system(system)
    return 'success'

@worksheet_command('pretty_print/<enable>')
def worksheet_pretty_print(worksheet, enable):
    worksheet.set_pretty_print(enable)
    return 'success'

@worksheet_command('continue_computation/<enable>')
def worksheet_continue_computation(worksheet, enable):
    worksheet.set_continue_computation(enable)
    return 'success'

@worksheet_command('conf')
def worksheet_conf(worksheet):
    return str(worksheet.conf())

######################################################
#  Websocket initialization
######################################################
@worksheet_command('get_username')
def worksheet_get_username(worksheet):
    ##Returns the username of the current session for Websocket-Initialization
    ## needed in nickname[] of Websocket -> Worksheet_Namespace

    # Sven: no more needed
    return g.username

########################################################
# Save a worksheet
########################################################
@worksheet_command('save')
def worksheet_save(worksheet):
    """
    Save the contents of a worksheet after editing it in plain-text
    edit mode.
    """
    if 'button_save' in request.form:
        E = request.values['textfield']
        worksheet.edit_save(E)
        worksheet.record_edit(g.username)
    return redirect(url_for_worksheet(worksheet))

@worksheet_command('save_snapshot')
def worksheet_save_snapshot(worksheet):
    """Save a snapshot of a worksheet."""
    worksheet.save_snapshot(g.username)
    return 'saved'

@worksheet_command('save_and_quit')
def worksheet_save_and_quit(worksheet):
    """Save a snapshot of a worksheet then quit it. """
    worksheet.save_snapshot(g.username)
    worksheet.quit()
    return 'saved'

#XXX: Redundant due to the above?
@worksheet_command('save_and_close')
def worksheet_save_and_close(worksheet):
    """Save a snapshot of a worksheet then quit it. """
    worksheet.save_snapshot(g.username)
    worksheet.quit()
    return 'saved'

@worksheet_command('discard_and_quit')
def worksheet_discard_and_quit(worksheet):
    """Quit the worksheet, discarding any changes."""
    worksheet.revert_to_last_saved_state()
    worksheet.quit()
    return 'saved' #XXX: Should this really be saved?

@worksheet_command('revert_to_last_saved_state')
def worksheet_revert_to_last_saved_state(worksheet):
    worksheet.revert_to_last_saved_state()
    return 'reverted'

########################################################
# Worksheet properties
########################################################
@worksheet_command('worksheet_properties')
def worksheet_properties(worksheet):
    """
    Send worksheet properties as a JSON object
    """
    from sagenb.notebook.misc import encode_response

    r = worksheet.basic()
    temp = r['collaborators']
    r.update({'collaborators_nicknames':[g.notebook.user_manager().user(x).get_nickname() for x in temp]})

    if worksheet.has_published_version():
        hostname = request.headers.get('host', g.notebook.interface + ':' + str(g.notebook.port))

        r['published_url'] = 'http%s://%s/home/%s' % ('' if not g.notebook.secure else 's',
                                            hostname,
                                            worksheet.published_version().filename())

    return encode_response(r)

########################################################
# Used in refreshing the cell list
########################################################
@worksheet_command('cell_properties')
def worksheet_cell_properties(worksheet):
    """
    Return the cell with the given id as a JSON object
    """
    id = get_cell_id()
    return encode_response(worksheet.get_cell_with_id(id).basic())

@worksheet_command('cell_list')
def worksheet_cell_list(worksheet):
    """
    Return a list of cells in JSON format.
    """
    r = {}
    r['state_number'] = worksheet.state_number()
    r['cell_list'] = [c.basic() for c in worksheet.cell_list()]
    return encode_response(r)

########################################################
# Set output type of a cell
########################################################
@worksheet_command('set_cell_output_type')
def worksheet_set_cell_output_type(worksheet):
    """
    Set the output type of the cell.

    This enables the type of output cell, such as to allowing wrapping
    for output that is very long.
    """
    id = get_cell_id()
    type = request.values['type']
    worksheet.get_cell_with_id(id).set_cell_output_type(type)
    return ''

########################################################
#Cell creation
########################################################
from sagenb.misc.misc import unicode_str
@worksheet_command('new_cell_before')
def worksheet_new_cell_before(worksheet):
    """Add a new cell before a given cell."""
    r = {}
    r['id'] =  id = get_cell_id()
    input = unicode_str(request.values.get('input', ''))
    cell = worksheet.new_cell_before(id, input=input)
    worksheet.increase_state_number()

    r['new_id'] = cell.id()
    #r['new_html'] = cell.html(div_wrap=False)

    return encode_response(r)

@worksheet_command('new_text_cell_before')
def worksheet_new_text_cell_before(worksheet):
    """Add a new text cell before a given cell."""
    r = {}
    r['id'] = id = get_cell_id()
    input = unicode_str(request.values.get('input', ''))
    cell = worksheet.new_text_cell_before(id, input=input)
    worksheet.increase_state_number()

    r['new_id'] = cell.id()
    #r['new_html'] = cell.html(editing=True)

    # XXX: Does editing correspond to TinyMCE?  If so, we should try
    # to centralize that code.
    return encode_response(r)


@worksheet_command('new_cell_after')
def worksheet_new_cell_after(worksheet):
    """Add a new cell after a given cell."""
    r = {}
    r['id'] = id = get_cell_id()
    input = unicode_str(request.values.get('input', ''))
    cell = worksheet.new_cell_after(id, input=input)
    worksheet.increase_state_number()

    r['new_id'] = cell.id()
    #r['new_html'] = cell.html(div_wrap=True)

    return encode_response(r)

@worksheet_command('new_text_cell_after')
def worksheet_new_text_cell_after(worksheet):
    """Add a new text cell after a given cell."""
    r = {}
    r['id'] = id = get_cell_id()
    input = unicode_str(request.values.get('input', ''))
    cell = worksheet.new_text_cell_after(id, input=input)
    worksheet.increase_state_number()

    r['new_id'] = cell.id()
    #r['new_html'] = cell.html(editing=True)

    # XXX: Does editing correspond to TinyMCE?  If so, we should try
    # to centralize that code.
    return encode_response(r)

@worksheet_command('move_cell_down')
def worksheet_move_cell_down(worksheet):
    """Move the given cell downwards by one step."""
    r = {}
    r['id'] = id = get_cell_id()
    r['status'] = 'success' if worksheet.move_cell_down(id) else 'failed'

    return encode_response(r)

@worksheet_command('move_cell_up')
def worksheet_move_cell_up(worksheet):
    """Move the given cell upwards by one step."""
    r = {}
    r['id'] = id = get_cell_id()
    r['status'] = 'success' if worksheet.move_cell_up(id) else 'failed'

    return encode_response(r)

########################################################
# Cell deletion
########################################################
@worksheet_command('delete_cell')
def worksheet_delete_cell(worksheet):
    """
    Deletes a worksheet cell, unless there's only one compute cell
    left.  This allows functions which evaluate relative to existing
    cells, e.g., inserting a new cell, to continue to work.
    """
    r = {}
    r['id'] = id = get_cell_id()
    if len(worksheet.cell_list()) <= 1:
        r['command'] = 'ignore'
    else:
        prev_id = worksheet.delete_cell_with_id(id)
        r['command'] = 'delete'
        r['prev_id'] = worksheet.delete_cell_with_id(id)
        r['cell_id_list'] = worksheet.cell_id_list()

    return encode_response(r)

@worksheet_command('delete_cell_output')
def worksheet_delete_cell_output(worksheet):
    """Delete's a cell's output."""
    r = {}
    r['id'] = id = get_cell_id()
    worksheet.get_cell_with_id(id).delete_output()
    r['command'] = 'delete_output'

    return encode_response(r)

########################################################
# Evaluation and cell update
########################################################
@worksheet_command('eval')
def worksheet_eval(worksheet):
    """
    Evaluate a worksheet cell.

    If the request is not authorized (the requester did not enter the
    correct password for the given worksheet), then the request to
    evaluate or introspect the cell is ignored.

    If the cell contains either 1 or 2 question marks at the end (not
    on a comment line), then this is interpreted as a request for
    either introspection to the documentation of the function, or the
    documentation of the function and the source code of the function
    respectively.
    """
    from base import notebook_updates

    r = {}

    r['id'] = id = get_cell_id()
    cell = worksheet.get_cell_with_id(id)
    public = worksheet.tags().get('_pub_', [False])[0] #this is set in pub_worksheet

    if public and not cell.is_interactive_cell():
        r['command'] = 'error'
        r['message'] = 'Cannot evaluate non-interactive public cell with ID %r.' % id
        return encode_response(r)

    worksheet.increase_state_number()

    if public:
        # Make public input cells read-only.
        input_text = cell.input_text()
    else:
        input_text = unicode_str(request.values.get('input', '')).replace('\r\n', '\n') #DOS

    # Handle an updated / recomputed interact.  TODO: JSON encode
    # the update data.
    if 'interact' in request.values:
        r['interact'] = 1
        input_text = INTERACT_UPDATE_PREFIX
        variable = request.values.get('variable', '')
        if variable != '':
            adapt_number = int(request.values.get('adapt_number', -1))
            value = request.values.get('value', '')
            input_text += "\n_interact_.update('%s', '%s', %s, _interact_.standard_b64decode('%s'), globals())" % (id, variable, adapt_number, value)

        if int(request.values.get('recompute', 0)):
            input_text += "\n_interact_.recompute('%s')" % id

    cell.set_input_text(input_text)

    if int(request.values.get('save_only', '0')):
        notebook_updates()
        return encode_response(r)
    elif int(request.values.get('text_only', '0')):
        notebook_updates()
        r['cell_html'] = cell.html()
        return encode_response(r)

    cell.evaluate(username=g.username)

    new_cell = int(request.values.get('newcell', 0)) #whether to insert a new cell or not
    if new_cell:
        new_cell = worksheet.new_cell_after(id)
        r['command'] = 'insert_cell'
        r['new_cell_id'] = new_cell.id()
        r['new_cell_html'] = new_cell.html(div_wrap=False)
    else:
        r['next_id'] = cell.next_compute_id()

    notebook_updates()

    return encode_response(r)

@worksheet_command('cell_update')
def worksheet_cell_update(worksheet):
    import time

    r = {}
    r['id'] = id = get_cell_id()

    # update the computation one "step".
    worksheet.check_comp()

    # now get latest status on our cell
    r['status'], cell = worksheet.check_cell(id)

    if r['status'] == 'd': # d=done
        #######
        # computation is done
        #####
        #print "Thomas: Computation is done! (status=d)"
        r['new_input'] = cell.changed_input_text()
        r['output_html'] = cell.output_html()

        # Update the log.
        t = time.strftime('%Y-%m-%d at %H:%M',
                          time.localtime(time.time()))
        H = "Worksheet '%s' (%s)\n" % (worksheet.name(), t)
        H += cell.edit_text(ncols=g.notebook.HISTORY_NCOLS, prompts=False,
                            max_out=g.notebook.HISTORY_MAX_OUTPUT)
        g.notebook.add_to_user_history(H, g.username)
    else:
        #print "Thomas: status!=d"
        r['new_input'] = ''
        r['output_html'] = ''

    r['interrupted'] = cell.interrupted()
    if 'Unhandled SIGSEGV' in cell.output_text(raw=True).split('\n'):
        r['interrupted'] = 'restart'
        print 'Segmentation fault detected in output!'

    r['output'] = cell.output_text(html=True)
    r['output_wrapped'] = cell.output_text(g.notebook.conf()['word_wrap_cols'])
    r['introspect_output'] = cell.introspect_output()

    # Compute 'em, if we got 'em.
    worksheet.start_next_comp()
    return encode_response(r)

########################################################
# Cell introspection
########################################################
@worksheet_command('introspect')
def worksheet_introspect(worksheet):
    """
    Cell introspection. This is called when the user presses the tab
    key in the browser in order to introspect.
    """
    r = {}
    r['id'] = id = get_cell_id()

    if worksheet.tags().get('_pub_', [False])[0]: #tags set in pub_worksheet
        r['command'] = 'error'
        r['message'] = 'Cannot evaluate public cell introspection.'
        return encode_response(r)

    before_cursor = request.values.get('before_cursor', '')
    after_cursor = request.values.get('after_cursor', '')
    cell = worksheet.get_cell_with_id(id)
    cell.evaluate(introspect=[before_cursor, after_cursor])

    r['command'] = 'introspect'
    return encode_response(r)

########################################################
# Edit the entire worksheet
########################################################
@worksheet_command('edit')
def worksheet_edit(worksheet):
    """
    Return a window that allows the user to edit the text of the
    worksheet with the given filename.
    """
    return render_template(os.path.join("html", "worksheet_edit.html"),
                           worksheet = worksheet,
                           username = g.username)

########################################################
# Plain text log view of worksheet
########################################################
@worksheet_command('text')
def worksheet_text(worksheet):
    """
    Return a window that allows the user to edit the text of the
    worksheet with the given filename.
    """
    from cgi import escape
    plain_text = worksheet.plain_text(prompts=True, banner=False)
    plain_text = escape(plain_text).strip()

    return render_template(os.path.join("html", "worksheet_text.html"),
                           username = g.username,
                           plain_text = plain_text)

########################################################
# Copy a worksheet
########################################################
@worksheet_command('copy')
def worksheet_copy(worksheet):
    copy = g.notebook.copy_worksheet(worksheet, g.username)
    if 'no_load' in request.values:
        return ''
    else:
        return redirect(url_for_worksheet(copy))

########################################################
# Get a copy of a published worksheet and start editing it
########################################################
@worksheet_command('edit_published_page')
def worksheet_edit_published_page(worksheet):
    ## if user_type(self.username) == 'guest':
    ##     return current_app.message('You must <a href="/">login first</a> in order to edit this worksheet.')

    ws = worksheet.worksheet_that_was_published()
    if ws.owner() == g.username:
        W = ws
    else:
        W = g.notebook.copy_worksheet(worksheet, g.username)
        W.set_name(worksheet.name())

    return url_for_worksheet(W)


########################################################
# Collaborate with others
########################################################
@worksheet_command('invite_collab')
def worksheet_invite_collab(worksheet):
    user_manager = g.notebook.user_manager()
    owner = worksheet.owner()
    owner_nickname = user_manager.user(owner).get_nickname()
    id_number = worksheet.id_number()
    old_collaborators = set(worksheet.collaborators())
    collaborators = set([u.strip() for u in request.values.get('collaborators', '').split(',') if u!=owner and u!=owner_nickname])
    if len(collaborators - old_collaborators) > 250:
        # to prevent abuse, you can't add more than 250 collaborators at a time
        return current_app.message(_("Error: can't add more than 250 collaborators at a time"), cont=url_for_worksheet(worksheet))

    collaborators_usernames = set()
    for k in collaborators:
        u = False
        # if no hrz type
        if not k.startswith('s') or not re.match("^[0-9]*$",k[1:]):
            if user_manager.is_nickname_known(k):
                u = user_manager.user(k,True).username()
            else:
                pass
        else:
            if user_manager.is_user_known(k):
                u = k
            elif user_manager.is_nickname_known(k):
                u = user_manager.user(k,True).username()
            else:
                pass

        if u!=False:
            collaborators_usernames.add(u)

    worksheet.set_collaborators(collaborators_usernames)

    # add worksheet to new collaborators
    for k in collaborators_usernames-old_collaborators:
        user_manager.user(k).viewable_worksheets().add((owner, id_number))
    # remove worksheet from ex-collaborators
    for k in old_collaborators-collaborators_usernames:
        user_manager.user(k).viewable_worksheets().discard((owner, id_number))
    return ''

########################################################
# Revisions
########################################################
# TODO take out or implement
@worksheet_command('revisions')
def worksheet_revisions(worksheet):
    """
    Show a list of revisions of this worksheet.
    """
    if 'action' not in request.values:
        if 'rev' in request.values:
            return g.notebook.html_specific_revision(g.username, worksheet,
                                                       request.values['rev'])
        else:
            return g.notebook.html_worksheet_revision_list(g.username, worksheet)
    else:
        rev = request.values['rev']
        action = request.values['action']
        if action == 'revert':
            import bz2
            worksheet.save_snapshot(g.username)
            #XXX: Requires access to filesystem
            txt = bz2.decompress(open(worksheet.get_snapshot_text_filename(rev)).read())
            worksheet.delete_cells_directory()
            worksheet.edit_save(txt)
            return redirect(url_for_worksheet(worksheet))
        elif action == 'publish':
            import bz2
            W = g.notebook.publish_worksheet(worksheet, g.username)
            txt = bz2.decompress(open(worksheet.get_snapshot_text_filename(rev)).read())
            W.delete_cells_directory()
            W.edit_save(txt)
            return redirect(url_for_worksheet(W))
        else:
            return current_app.message(_('Error'))

########################################################
# Cell directories
########################################################
@worksheet_command('cells/<path:filename>')
def worksheet_cells(worksheet, filename):
    #XXX: This requires that the worker filesystem be accessible from
    #the server.
    from flask.helpers import send_from_directory
    return send_from_directory(worksheet.cells_directory(), filename)


##############################################
# Data
##############################################
@worksheet_command('data/<path:filename>')
def worksheed_data_folder(worksheet, filename):
    # preferred way of accessing data
    return worksheet_data(worksheet, filename)

def worksheet_data(worksheet, filename):
    dir = os.path.abspath(worksheet.data_directory())
    if not os.path.exists(dir):
        return make_response(_('No data file'), 404)
    else:
        from flask.helpers import send_from_directory
        return send_from_directory(worksheet.data_directory(), filename)

@worksheet_command('delete_datafile')
def worksheet_delete_datafile(worksheet):
    dir = os.path.abspath(worksheet.data_directory())
    filename = request.values['name']
    path = os.path.join(dir, filename)
    os.unlink(path)
    return ''

@worksheet_command('edit_datafile/<path:filename>')
def worksheet_edit_datafile(worksheet, filename):
    ext = os.path.splitext(filename)[1].lower()
    file_is_image, file_is_text = False, False
    text_file_content = ""

    path = "/home/%s/data/%s" % (worksheet.filename(), filename)

    if ext in ['.png', '.jpg', '.gif']:
        file_is_image = True
    if ext in ['.txt', '.tex', '.sage', '.spyx', '.py', '.f', '.f90', '.c']:
        file_is_text = True
        text_file_content = open(os.path.join(worksheet.data_directory(), filename)).read()

    return render_template(os.path.join("html", "datafile_edit.html"),
                           worksheet = worksheet,
                           username = g.username,
                           filename_ = filename,
                           file_is_image = file_is_image,
                           file_is_text = file_is_text,
                           text_file_content = text_file_content,
                           path = path)

@worksheet_command('save_datafile')
def worksheet_save_datafile(worksheet):
    filename = request.values['filename']
    if 'button_save' in request.values:
        text_field = request.values['textfield']
        dest = os.path.join(worksheet.data_directory(), filename) #XXX: Requires access to filesystem
        if os.path.exists(dest):
            os.unlink(dest)
        open(dest, 'w').write(text_field)

    print 'saving datafile, redirect'
    return redirect(url_for_worksheet(worksheet))

# @worksheet_command('link_datafile')
# def worksheet_link_datafile(worksheet):
#     target_worksheet_filename = request.values['target']
#     data_filename = request.values['filename']
#     src = os.path.abspath(os.path.join(
#         worksheet.data_directory(), data_filename))
#     target_ws =  g.notebook.get_worksheet_with_filename(target_worksheet_filename)
#     target = os.path.abspath(os.path.join(
#         target_ws.data_directory(), data_filename))
#     if target_ws.owner() != g.username and not target_ws.is_collaborator(g.username):
#         return current_app.message(_("illegal link attempt!"), worksheet_datafile.url_for(worksheet, name=data_filename))
#     if os.path.exists(target):
#         return current_app.message(_("The data filename already exists in other worksheet\nDelete the file in the other worksheet before creating a link."), worksheet_datafile.url_for(worksheet, name=data_filename))
#     os.link(src,target)
#     return redirect(worksheet_datafile.url_for(worksheet, name=data_filename))
#     #return redirect(url_for_worksheet(target_ws) + '/datafile?name=%s'%data_filename) #XXX: Can we not hardcode this?

@worksheet_command('upload_datafile')
def worksheet_upload_datafile(worksheet):
    from werkzeug.utils import secure_filename

    file = request.files['file']
    name = request.values.get('name', '').strip() or file.filename
    name = secure_filename(name)

    #XXX: disk access
    dest = os.path.join(worksheet.data_directory(), name)
    if os.path.exists(dest):
        if not os.path.isfile(dest):
            return _('Suspicious filename encountered uploading file.')
        os.unlink(dest)

    file.save(dest)
    return ''

@worksheet_command('datafile_from_url')
def worksheet_datafile_from_url(worksheet):
    from werkzeug.utils import secure_filename

    name = request.values.get('name', '').strip()
    url = request.values.get('url', '').strip()
    if url and not name:
        name = url.split('/')[-1]
    name = secure_filename(name)

    import urllib2
    from urlparse import urlparse
    # we normalize the url by parsing it first
    parsedurl = urlparse(url)
    if not parsedurl[0] in ('http','https','ftp'):
        return _('URL must start with http, https, or ftp.')
    download = urllib2.urlopen(parsedurl.geturl())

    dest = os.path.join(worksheet.data_directory(), name)
    if os.path.exists(dest):
        if not os.path.isfile(dest):
            return _('Suspicious filename encountered uploading file.')
        os.unlink(dest)

    import re
    matches = re.match("file://(?:localhost)?(/.+)", url)
    if matches:
        f = file(dest, 'wb')
        f.write(open(matches.group(1)).read())
        f.close()
        return ''

    with open(dest, 'w') as f:
        f.write(download.read())
    return ''

@worksheet_command('new_datafile')
def worksheet_new_datafile(worksheet):
    from werkzeug.utils import secure_filename

    name = request.values.get('new', '').strip()
    name = secure_filename(name)

    #XXX: disk access
    dest = os.path.join(worksheet.data_directory(), name)
    if os.path.exists(dest):
        if not os.path.isfile(dest):
            return _('Suspicious filename encountered uploading file.')
        os.unlink(dest)

    open(dest, 'w').close()
    return ''

###############################
#Chat History
################################

@worksheet_command('chat_history/<num>/<starting>')
def chat_history(worksheet, num, starting):
    """
    Send chat history as a JSON object
    """
    from sagenb.notebook.misc import encode_response

    num = int(num)
    starting = int(starting)
    if starting > 0 and num > 0:
        messages = g.db.query(Chatlog_entry).\
                filter_by(wsid=worksheet.filename()).\
                filter(Chatlog_entry.id < starting).\
                order_by(Chatlog_entry.id.desc())[:num]
    elif starting > 0: # take everything from starting point
        messages = g.db.query(Chatlog_entry).\
                filter_by(wsid=worksheet.filename()).\
                filter(Chatlog_entry.id < starting).\
                order_by(Chatlog_entry.id.desc()).all()
    elif num > 0: # no starting point -> don't filter IDs
        messages = g.db.query(Chatlog_entry).\
                filter_by(wsid=worksheet.filename()).\
                order_by(Chatlog_entry.id.desc())[:num]
    else: # don't filter anything
        messages = g.db.query(Chatlog_entry).\
                filter_by(wsid=worksheet.filename()).\
                order_by(Chatlog_entry.id.desc()).all()

    r = []
    nickname_map = {}
    for message in messages:
        try:
            nickname = nickname_map[message.userid]
        except LookupError:
            nickname = g.notebook.user_manager().user(message.userid).get_nickname()
            nickname_map[message.userid] = nickname

        r.append({'id': message.id, 'time': message.time.replace(microsecond=0).isoformat(),
            'nickname': nickname, 'username': message.userid, 'msg': message.msg})

    return encode_response(r)

################################
#Publishing
################################
@worksheet_command('publish')
def worksheet_publish(worksheet):
    """
    This provides a frontend to the management of worksheet
    publication. This management functionality includes
    initializational of publication, re-publication, automated
    publication when a worksheet saved, and ending of publication.
    """
    if 'publish_on' in request.values:
        g.notebook.publish_worksheet(worksheet, g.username)

        # update database
        #ws_db = getDBWorksheet(worksheet)
        #ws_db.public_id = worksheet.published_version().id_number()
        #g.db.commit()

    if 'publish_off' in request.values and worksheet.has_published_version():
        g.notebook.delete_worksheet(worksheet.published_version().filename())

        # update database
        #ws_db = getDBWorksheet(worksheet)
        #ws_db.public_id = None
        #g.db.commit()

    if 'auto_on' in request.values:
        worksheet.set_auto_publish(True)
    if 'auto_off' in request.values:
        worksheet.set_auto_publish(False)
    if 'is_auto' in request.values:
        return str(worksheet.is_auto_publish())

    if 'republish' in request.values:
        g.notebook.publish_worksheet(worksheet, g.username)

    return ''

############################################
# Ratings
############################################
# @worksheet_command('rating_info')
# def worksheet_rating_info(worksheet):
#     return worksheet.html_ratings_info()

# @worksheet_command('rate')
# def worksheet_rate(worksheet):
#     ## if user_type(self.username) == "guest":
#     ##     return HTMLResponse(stream = message(
#     ##         'You must <a href="/">login first</a> in order to rate this worksheet.', ret))

#     rating = int(request.values['rating'])
#     if rating < 0 or rating >= 5:
#         return current_app.messge("Gees -- You can't fool the rating system that easily!",
#                           url_for_worksheet(worksheet))

#     comment = request.values['comment']
#     worksheet.rate(rating, comment, g.username)
#     s = """
#     Thank you for rating the worksheet <b><i>%s</i></b>!
#     You can <a href="rating_info">see all ratings of this worksheet.</a>
#     """%(worksheet.name())
#     #XXX: Hardcoded url
#     return current_app.message(s.strip(), '/pub/', title=u'Rating Accepted')


########################################################
# Downloading, moving around, renaming, etc.
########################################################
@worksheet_command('download/<path:title>')
def worksheet_download(worksheet, title):
    return unconditional_download(worksheet, title)

def unconditional_download(worksheet, title):
    from sagenb.misc.misc import tmp_filename
    from flask.helpers import send_file
    filename = tmp_filename() + '.sws'

    if title.endswith('.sws'):
        title = title[:-4]

    try:
        #XXX: Accessing the hard disk.
        g.notebook.export_worksheet(worksheet.filename(), filename, title)
    except KeyError:
        return current_app.message(_('No such worksheet.'))

    from flask.helpers import send_file
    return send_file(filename, mimetype='application/sage')


@worksheet_command('restart_sage')
def worksheet_restart_sage(worksheet):
    #XXX: TODO -- this must not block long (!)
    #getDBWorksheet(g.db,worksheet).running = False
    #g.db.commit()
    worksheet.restart_sage()
    return 'done'

@worksheet_command('quit_sage')
def worksheet_quit_sage(worksheet):
    #XXX: TODO -- this must not block long (!)
    #getDBWorksheet(g.db,worksheet).running = False
    #g.db.commit()
    worksheet.quit()
    return 'done'

@worksheet_command('interrupt')
def worksheet_interrupt(worksheet):
    #XXX: TODO -- this must not block long (!)
    worksheet.sage().interrupt()
    if worksheet.sage().is_computing():
        return 'failed'
    else:
        #getDBWorksheet(g.db,worksheet).running = False
        #g.db.commit()
        return 'success'

@worksheet_command('hide_all')
def worksheet_hide_all(worksheet):
    worksheet.hide_all()
    return 'success'

@worksheet_command('show_all')
def worksheet_show_all(worksheet):
    worksheet.show_all()
    return 'success'

@worksheet_command('delete_all_output')
def worksheet_delete_all_output(worksheet):
    try:
        worksheet.delete_all_output(g.username)
    except ValueError:
        return 'fail'
    else:
        return 'success'

@worksheet_command('print')
def worksheet_print(worksheet):
    #XXX: We might want to separate the printing template from the
    #regular html template.
    return g.notebook.html(worksheet.filename(), do_print=True)


#######################################################
# Live "docbrowser" worksheets from HTML documentation
#######################################################
doc_worksheet_number = -1
def doc_worksheet():
    global doc_worksheet_number
    doc_worksheet_number = doc_worksheet_number % g.notebook.conf()['doc_pool_size']
    W = None
    for X in g.notebook.users_worksheets('_sage_'):
        if X.compute_process_has_been_started():
            continue
        if X.id_number() == doc_worksheet_number:
            W = X
            W.clear()
            break

    if W is None:
        # The first argument here is the worksheet's title, which the
        # caller should set with W.set_name.
        W = g.notebook.create_new_worksheet('', '_sage_')
    return W

# def extract_title(html_page):
#     #XXX: This might be better as a regex
#     h = html_page.lower()
#     i = h.find('<title>')
#     if i == -1:
#         return gettext("Untitled")
#     j = h.find('</title>')
#     return html_page[i + len('<title>') : j]

# @login_required
# def worksheet_file(path):
#     # Create a live Sage worksheet from the given path.
#     if not os.path.exists(path):
#         return current_app.message(_('Document does not exist.'))

#     doc_page_html = open(path).read()
#     from sagenb.notebook.docHTMLProcessor import SphinxHTMLProcessor
#     doc_page = SphinxHTMLProcessor().process_doc_html(doc_page_html)

#     title = (extract_title(doc_page_html).replace('&mdash;', '--') or
#              'Live Sage Documentation')

#     W = doc_worksheet()
#     W.edit_save(doc_page)
#     W.set_system('sage')
#     W.set_name(title)
#     W.save()
#     W.quit()

#     # FIXME: For some reason, an extra cell gets added so we
#     # remove it here.
#     W.cell_list().pop()

#     # TODO
#     return g.notebook.html(worksheet_filename=W.filename(),
#                            username=g.username)


####################
# Public Worksheets
####################
# def pub_worksheet(source):
#     # TODO: Independent pub pool and server settings.
#     proxy = doc_worksheet()
#     proxy.set_name(source.name())
#     proxy.set_last_change(*source.last_change())
#     proxy.set_worksheet_that_was_published(source.worksheet_that_was_published())
#     g.notebook._initialize_worksheet(source, proxy)
#     proxy.set_tags({'_pub_': [True]})
#     proxy.save()
#     return proxy

#######################################################
# Jmol Popup
#######################################################
@ws.route('/home/<username>/<id>/jmol_popup.html', methods=['GET'])
@login_required
def jmol_popup(username, id):
    return render_template(os.path.join('html', 'jmol_popup.html'))

######################################################
# Websocket Handshake
#######################################################
from flask import globals

@ws.route('/socket.io/<path:remaining>')
def socketio(remaining):
    print "WEBSOCKETS: Connection established! (flask_version/worksheet.py)"
    try:
        environment = request.environ.copy()

        # here, information can be passed to the socket
        environment.update({'notebook':g.notebook, 'db':g.db})

        socketio_manage(environment, {'/worksheet': WorksheetNamespace}, request)
    except:
        print "WEBSOCKETS: !!!!! Connection PROBLEM!!!!! (flask_version/worksheet.py)"
    return Response()


#########################################################
# Websocket Namespace
##########################################################
class WorksheetNamespace(BaseNamespace, RoomsMixin, BroadcastMixin):
    # nicknames: a list of dictionaries with the entries
    #  { nickname: "sage username", color: "#aabbcc", uuid: "886313e1-3b8a-537..." }
    # this enables the same user opens his worksheet multiple times.
    # The UUID is chosen randomly at server site and is only used internally to
    # distinguish between sessions

    # nicknames: a list of self.session['session_nick'] objects, each containing data like
    #  { nickname: "sage username", color: "#aabbcc", }
    # thus enabling the same user opening his worksheet multiple times.
    nicknames = {}
    active_cells = {}
    colors = {}


#    def recv_connect(self):

    def duplicate_free(self, user_list):
        nicknames_seen = []
        users = []
        for u in user_list:
            if u['nickname'] not in nicknames_seen:
                users.append(u)
                nicknames_seen.append(u['nickname'])
        return users


    # client information handler
    def on_join(self, data):
        self.db = self.environ['db']
        # expecting data = {nickname:"sage username", "worksheet":"worksheet-name", "username":"HRZname"}
        self.room = data['worksheet']

        try:
            self.active_cells[self.room]
        except KeyError:
            # we are the first in this room
            self.active_cells[self.room] = []

        # shortcut
        self.ws_a_cells = self.active_cells[self.room]
        for cell_id in self.ws_a_cells:
            self.emit('cell_evaluate', cell_id)

        try:
            self.nicknames[self.room]
        except KeyError:
            # we are the first in this room
            self.nicknames[self.room] = []

        # shortcut
        self.ws_nicks = self.nicknames[self.room]

        try:
            self.colors[self.room]
        except KeyError:
            # we are the first in this room
            self.colors[self.room] = ['#cf4769', '#69cf47', '#cfae47', '#cf47ac', '#47cf6a', '#4869cf']

        # shortcut
        self.ws_colors = self.colors[self.room]

        self.join(self.room)

        # we can't directly use the self.session object because it contains
        # room information from the room mixin which is basically a python set
        # and not serializable by encode_response. And it isn't supposed to be
        # shared anyway.
        self.session['session_nick'] = {}
        self.session['session_nick']['nickname'] = data['nickname']
        self.session['session_nick']['username'] = data['username']

        self.session['session_nick']['doubleuser'] = False


        # store this session in the nickname list
        doubleuser = False
        for n in self.ws_nicks:
            if data['nickname'] == n['nickname']:
                self.session['session_nick']['color'] = n['color']
                doubleuser = self.session['session_nick']['doubleuser'] = True
                break

        # Double user check. If double user, do not append to ws_nicks list and
        # mark each user with that nick as doubleuser
        if not doubleuser:
            try:
                # take first color
                self.session['session_nick']['color'] = self.ws_colors.pop()
            except IndexError:
                # otherwise use black
                self.session['session_nick']['color'] = "#000000"
            self.ws_nicks.append(self.session['session_nick'])
            self.emit('new_nickname_list',
                    encode_response(self.duplicate_free(self.ws_nicks)))
            self.emit_to_room(self.room, 'new_nickname_list',
                    encode_response(self.duplicate_free(self.ws_nicks)))
            self.emit_to_room(self.room, 'join_message',
                    encode_response(self.session['session_nick']))
        else:
            for n in self.ws_nicks:
                if n['nickname'] == data['nickname']:
                    n['doubleuser'] = True
            self.ws_nicks.append(self.session['session_nick'])
            self.emit('new_nickname_list',
                    encode_response(self.duplicate_free(self.ws_nicks)))

        def client_watcher_process():
            # array of dictionaries, one for each user, with keys 'nickname', 'username' and 'color'
            userlist = self.ws_nicks

            if len(userlist) == 1: #if this is the first user in this room start loop

                # get current worksheet
                notebook = self.environ['notebook']
                # self.room entspricht z.B. s1320604/2
                worksheet = notebook.get_worksheet_with_filename(self.room)

                # main loop
                while len(self.ws_nicks)!=0: #if everybody is gone stop the loop
                    for cell_id in self.ws_a_cells:
                        #status, cell = worksheet.check_cell(cell_id)
                        r = self.build_result(worksheet, cell_id)
                        if r['status'] == 'd':

                            # websocket broadcast
                            reply = encode_response(r)
                            self.emit('eval_reply', reply, r['new_input'])
                            self.emit_to_room(self.room, 'eval_reply', reply, r['new_input'])
                            # remove id
                            self.ws_a_cells.remove(cell_id)

                            # send email if computation finished while all users are gone
                            #server = smtplib.SMTP('localhost')
                            #server.sendmail("service@pokal.uni-frankfurt.de", "receiver@abc.de", "Your computation has finished!!")

                    gevent.sleep(0.2) # in Sekunden
                if worksheet.continue_computation()==False or worksheet.computing()==False:
                    worksheet.set_not_computing()
                    worksheet.quit()
                    #worksheet.get_sage().quit()
        self.spawn(client_watcher_process)
        return True

    # cell operations handler
    def on_new_cell_after(self, response):
        self.emit_to_room(self.room,'new_cell_after', response)

    def on_new_text_cell_after(self, response):
        self.emit_to_room(self.room,'new_text_cell_after', response)

    def on_new_text_cell_before(self, response):
        self.emit_to_room(self.room,'new_text_cell_before', response)

    def on_new_cell_before(self, response):
        self.emit_to_room(self.room,'new_cell_before', response)

    def on_delete_cell(self, cell_id):
        self.emit('delete_cell', cell_id)
        self.emit_to_room(self.room,'delete_cell', cell_id)

    # cell event handler
    def on_cell_focused(self, cell_id, username):
        #print "cell " + str(cell_id) + " has been focused by " + username
        self.emit_to_room(self.room,'cell_focused', cell_id, username)

    def on_cell_released(self, cell_id, username):
        #print "cell " + str(cell_id) + " has been released by " + username
        self.emit_to_room(self.room,'cell_released', cell_id, username)

    def on_cell_evaluate(self, cell_id, username):
        #print "cell "+str(cell_id)+" is going to be evaluated by "+username
        if not cell_id in self.ws_a_cells:
            self.ws_a_cells.append(cell_id)
        self.emit_to_room(self.room,'cell_evaluate', cell_id, username)

    # Used for Realtime Input-Synchronisation
    # input = input as string + new char
    # this message will be sent every time an input cell gets changed (every
    # Keypress on focus)
    def on_cell_input_changed(self, cell_id, input):
        self.emit_to_room(self.room, 'cell_input_changed', cell_id, input)

    def on_text_cell_cancel(self, cell_id, input):
        self.emit_to_room(self.room, 'text_cell_cancel', cell_id, input)

    def on_text_cell_save(self, cell_id, input):
        self.emit_to_room(self.room, 'text_cell_save', cell_id, input)

    def on_text_cell_startedit(self, cell_id):
        self.emit_to_room(self.room, 'text_cell_startedit', cell_id)


    # evaluate handler
    # this function is not needed anymore because the server handles this now
    def on_eval_result_broadcast(self, result, input):
        #self.emit('eval_reply', result)
        #self.emit_to_room(self.room, 'eval_reply', result, input)
        return True

    def on_set_state_number(self, statenumber):
        print statenumber
        self.emit('set_state_number', statenumber)
        self.emit_to_room(self.room, 'set_state_number', statenumber)

    def on_slider_state(self, val, div_id):
        self.emit_to_room(self.room, 'slider_state', val, div_id)

    # chat handler
    def on_user_message(self, msg):
        if msg.startswith('/'):
            outtxt = ""
            if msg == "/a":
                outtxt = str(len(self.active_cells[self.room]) != 0)
            elif msg == "/h":
                outtxt = "Befehle: /a, /history, /users, /room"
            elif msg == "/history":
                outtxt = str(self.get_chat_history())
            elif msg == "/users":
                outtxt = str(self.ws_nicks)
            elif msg == "/room":
                outtxt = self.room
            else:
                self.msg = self.msg_object(msg, -1)
                self.emit('user_message', self.msg)
                return

            msg = {'nickname':'Server', 'username':'Server', 'color':'#000000'}
            msg.update({
                'time': datetime.datetime.now().replace(microsecond=0).isoformat(),
                'msg': outtxt, 'id':-1})
            self.msg = encode_response(msg)
            self.emit('user_message', self.msg)
            return
        msg_db = Chatlog_entry(msg, self.session['session_nick']['username'],
                               self.room)
        self.db.add(msg_db)
        self.db.commit()
        self.msg = self.msg_object(msg, msg_db.id)
        self.emit('user_message', self.msg)
        self.emit_to_room(self.room, 'user_message', self.msg)

    def get_chat_history(self):
        return self.db.query(Chatlog_entry).filter_by(wsid=self.room).order_by(
                             Chatlog_entry.time).all()

    def msg_object(self, msg, msg_id):
        msg_obj = {'username': self.session['session_nick']['username'],
                'nickname': self.session['session_nick']['nickname'],
                'color': self.session['session_nick']['color'],
                'msg': msg,
                'id': msg_id,
                'time': datetime.datetime.now().replace(microsecond=0).isoformat(),
                }
        return encode_response(msg_obj)

    # connection handler
    def recv_disconnect(self):
        try:
            if not (self.session['session_nick'] in self.ws_nicks):
                # this should never happen?
                return True
            if self.session['session_nick']['doubleuser']:
                self.ws_nicks.remove(self.session['session_nick'])
                idxs = [i for i, x in enumerate(self.ws_nicks) if x['nickname'] == self.session['session_nick']['nickname']]
                if len(idxs) == 1:
                    self.ws_nicks[idxs[0]]['doubleuser'] = False
            else:
                self.ws_nicks.remove(self.session['session_nick'])
                self.emit_to_room(self.room, 'leave_message', encode_response(
                    self.session['session_nick']))
                self.emit_to_room(self.room, 'new_nickname_list',
                        encode_response(self.duplicate_free(self.ws_nicks)))
                self.ws_colors.append(self.session['session_nick']['color'])
                #self.emit('new_nickname_list', encode_response(self.ws_nicks))
            return True
        except KeyError:
             # self.session['session_nick'] does not exist
             return False

    def on_disconnect(self):
        # disconnect user from chat since he is leaving
        self.recv_disconnect()


    def build_result(self, worksheet, cell_id):
        #import time

        notebook = self.environ['notebook']
        r = {}
        r['id'] = cell_id

        # update the computation one "step".
        try:
            worksheet.check_comp()
        except IndexError:
            # if this exception is not caught, the server loop will halt
            r['status'] = 'w'
            return r

        # now get latest status on our cell
        r['status'], cell = worksheet.check_cell(cell_id)

        if r['status'] == 'd': # d=done
            #######
            # computation is done
            #####
            r['new_input'] = cell.changed_input_text()
            r['output_html'] = cell.output_html()

            # Update the log.
            #t = time.strftime('%Y-%m-%d at %H:%M',
            #                  time.localtime(time.time()))
            #H = "Worksheet '%s' (%s)\n" % (worksheet.name(), t)
            #H += cell.edit_text(ncols=g.notebook.HISTORY_NCOLS, prompts=False,
            #                    max_out=g.notebook.HISTORY_MAX_OUTPUT)
            #notebook.add_to_user_history(H, g.username)
        else:
            r['new_input'] = ''
            r['output_html'] = ''

        r['interrupted'] = cell.interrupted()
        if 'Unhandled SIGSEGV' in cell.output_text(raw=True).split('\n'):
            r['interrupted'] = 'restart'
            print 'Segmentation fault detected in output!'

        r['output'] = cell.output_text(html=True)
        r['output_wrapped'] = cell.output_text(notebook.conf()['word_wrap_cols'])

        # the following line had to be commented
        # because it wasn't supposed to be called at the times that this whole
        # function here is called
        #r['introspect_output'] = cell.introspect_output()

        # without this the next computations are not started
        worksheet.start_next_comp()
        return r

