from flask import (
    render_template, request,
    send_from_directory, make_response)
import flask
import os
import logging
import uuid
from ..app import bokeh_app
from .. import wsmanager
log = logging.getLogger(__name__)

#web socket subscriber
@bokeh_app.route('/bokeh/sub')
def sub():
    if request.environ.get('wsgi.websocket'):
        ws = request.environ['wsgi.websocket']
        wsmanager.run_socket(ws, bokeh_app.wsmanager)
    return "done"
