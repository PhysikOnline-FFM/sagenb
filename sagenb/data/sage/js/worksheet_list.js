/* Javascript for worksheet_list.html
 * 
 * AUTHOR - Samuel Ainsworth (samuel_ainsworth@brown.edu)
 */

// simulated namespace
sagenb.worksheetlistapp = {};

sagenb.worksheetlistapp.list_row = function() {
	var _this = this;
	
	_this.jquery_this = null;
	
	// properties object
	_this.props = null;
	_this.checked = false;
	_this.list = null;
	
	_this.init = function() {

	};
	
	_this.render = function() {
		$("tbody").append('<tr id="row_' + _this.props.filename.replace("/", "_") + '">' + 
				'<td class="checkbox_cell"><input type="checkbox"></td>' + 
				'<td class="worksheet_name_cell"></td>' +
				'<td class="owner_cell"></td>' + 
				'<td class="last_edit_cell"></td>' + 
			'</tr>');
		
		_this.jquery_this = $("#row_" + _this.props.filename.replace("/", "_"));
		
		// checkbox
		if(_this.list.published_mode) {
			_this.jquery_this.find("td.checkbox_cell").detach();
		}
		else {
			_this.jquery_this.find("input").change(function(e) {
				_this.checked = _this.jquery_this.find("input").prop("checked");
			});
		}
		
		// name/running
		var name_html = "";
		if(_this.list.published_mode) {
			name_html += '<a href="/home/pub/' + _this.props.published_id_number + '" >' + _this.props.name + '</a>';
		}
		else {
			name_html += '<a href="/home/' + _this.props.filename + '" >' + _this.props.name + '</a>';
			/* Tags */
			try {
				name_html += '<input type="text" name="'+_this.props.filename+'" class="tagit" placeholder="'+gettext('Add new tag')+'" value="'+ _this.props.pokaltags[sagenb.username].join(',') +'">';
			}
			catch(e) {
				name_html += '<input type="text" name="'+_this.props.filename+'" class="tagit" placeholder="'+gettext('Add new tag')+'" value="">';
			}
            //name_html += '<span class="icon-plus-sign add-tag-sign"></span>';
		}
		if(_this.props.running && !_this.list.published_mode) {
			name_html = '<span class="label label-warning pull-right running_label">aktiv</span>' + name_html;
		}
		_this.jquery_this.find("td.worksheet_name_cell").html(name_html);
	
		/*if(_this.props.computing) {
			_this.jquery_this.find("a").css('color','#004263')
		}*/

				
		// owner/collaborators/published
		var owner_html = _this.props.owner_nickname;
        try {
            if(_this.props.collaborators && _this.props.collaborators.length) {
                // there are collaborators
                if(_this.props.collaborators.length == 1) {
                    owner_html += ' '+ gettext('and') +' <a href="#" class="collaborators_tooltip" rel="tooltip" title="' + _this.props.collaborators_nicknames.join(", ") + '">' + _this.props.collaborators.length + ' anderer</a>';
                } else {
                    owner_html += ' '+ gettext('and') +' <a href="#" class="collaborators_tooltip" rel="tooltip" title="' + _this.props.collaborators_nicknames.join(", ") + '">' + _this.props.collaborators.length + ' andere</a>';
                }
            }	
        } catch(e) {
        }
		if(_this.props.published_id_number && !_this.list.published_mode) {
			// it's published
			owner_html += '<a href="#"><span class="published_badge badge badge-info pull-right"><i class="glyphicon glyphicon-share"></i></span></a>';
		}
		_this.jquery_this.find("td.owner_cell").html(owner_html);
		_this.jquery_this.find("td.owner_cell .collaborators_tooltip").tooltip();

		$(".published_badge").click(function() {
			$("#search_input").val("option:published");
			sagenb.worksheetlistapp.worksheet_list.do_search();
		});
		
		// Init tagit (worksheet tags)
		var tagitelements = _this.jquery_this.find(".tagit");

		tagitelements.tagit({
				removeConfirmation: true,
				placeholderText: gettext('Add new tag'),
                onTagClicked: function(evt, ui) {
	            	//tagitelements.tagit('tagLabel', ui.tag)
					$("#search_input").val("tag:"+tagitelements.tagit('tagLabel', ui.tag));
					sagenb.worksheetlistapp.worksheet_list.do_search();
	            },
                afterTagAdded: function(evt, ui) {
					if (!ui.duringInitialization) {
						sagenb.async_request("/add_tag", sagenb.generic_callback(function(status, response) {
							// nothing here
						}), {
								filename: _this.props.filename,
								tag_name: tagitelements.tagit('tagLabel', ui.tag)
						});
					}
				},
				afterTagRemoved: function(evt, ui) {
					sagenb.async_request("/remove_tag", sagenb.generic_callback(function(status, response) {
						// nothing here
					}), {
							filename: _this.props.filename,
							tag_name: tagitelements.tagit('tagLabel', ui.tag)
					});
				}
		});

		// last change
		_this.jquery_this.find("td.last_edit_cell").text(_this.props.last_change_pretty);
	};

	// delete worksheet (animation)
	_this.remove = function() {
		_this.jquery_this.hide("slow", function() {
			_this.jquery_this.detach();
			delete _this.list.rows[_this.props.filename];
		});
	}
	
	_this.check = function() {
		_this.checked = true;
		_this.jquery_this.find("input").prop("checked", true);
	};
	
	_this.uncheck = function() {
		_this.checked = false;
		_this.jquery_this.find("input").prop("checked", false);
	};
};

sagenb.worksheetlistapp.worksheet_list = function() {
	var _this = this;
	
	/* Key-value object of all of the worksheet rows.
	Uses worksheet filenames as keys because id numbers
	are unique to users but not to the entire notebook.
	Therefore, the admin will run into errors. */
	_this.rows = {};
	
	_this.init = function() {
		if(_this.published_mode) _this.show_published();
		else _this.show_active();
		
		$("#main_checkbox").change(function(e) {
			if($("#main_checkbox").prop("checked")) {
				// checked -> check all
				_this.check_all();
			} else {
				// unchecked -> uncheck all
				_this.check_none();
			}
		});
		
		$("#send_to_archive_button").click(_this.archive);
		$("#unarchive_button").click(_this.unarchive);
		$("#delete_button").click(_this.delete);
		$("#undelete_button").click(_this.undelete);
		$("#stop_button").click(_this.stop);
		$("#download_button").click(_this.download);
		$("#duplicate_button").click(_this.duplicate);
		$("#empty_trash").click(_this.empty_trash);
		
		$("#show_active").click(_this.show_active);
		$("#show_archive").click(_this.show_archive);
		$("#show_trash").click(_this.show_trash);
		
		$("#submit_search").click(_this.do_search);
        $("#search_clear").click(function(event) {
            $("#search_input").val('');
			_this.do_search(event);
        });
        console.log("add handler");
        $("span.add-tag-sign").click(function() {
            alert("hi");
        });
		
		// Bind hotkeys
		$(document).bind("keydown", sagenb.ctrlkey + "+N", function(evt) { _this.new_worksheet(); return false; });
		$(document).bind("keydown", "DEL", function(evt) { _this.delete(); });
		$(document).bind("keydown", "ESC", function(evt) {
			if ($("#search_input").val() !== ''){
				$("#search_input").val('');
				_this.do_search();
			}
		});
	};
	
	///////// FOR EACH ///////////
	_this.for_each_row = function(f) {
		$.each(_this.rows, function(filename, list_row) {
			if(list_row) f(list_row);
		});
	};
	_this.for_each_checked_row = function(f) {
		$.each(_this.rows, function(filename, list_row) {
			if(list_row && list_row.checked) f(list_row);
		});
	};
	
	////////// CHECKING //////////
	_this.check_all = function() {
		_this.for_each_row(function(list_row) {
			list_row.check();
		});
	};
	_this.check_none = function() {
		_this.for_each_row(function(list_row) {
			list_row.uncheck();
		});
	};
	
	/////////// FILENAMES ////////////
	_this.checked_worksheet_filenames = function() {
		var r = [];
		_this.for_each_checked_row(function(list_row) {
			r.push(list_row.props.filename);
		});
		return r;
	};
	
	////////// COMMANDS //////////////
	_this.new_worksheet = function() {
		if(_this.published_mode) return;
		window.open("/new_worksheet");
	};
	_this.upload_worksheet = function() {
		if(_this.published_mode) return;
	};
	_this.download_all_active = function() {
		if(_this.published_mode) return;
		window.location.replace("/download_worksheets.zip");
	};
	
	_this.checked_action = function(action, extra_callback) {
		if(_this.published_mode) return;
		// don't do anything if none are selected
		if(_this.checked_worksheet_filenames().length === 0) return;
		
		var callback = sagenb.generic_callback();
		if(extra_callback) callback = sagenb.generic_callback(extra_callback);
		
		sagenb.async_request(action, callback, {
			filenames: encode_response(_this.checked_worksheet_filenames())
		});
	}
	_this.archive = function() {
		if($("#send_to_archive_button").hasClass("disabled")) return;
		_this.checked_action("/send_to_archive", function(status, response) {
			_this.for_each_checked_row(function(row) {
				row.remove();
			});
		});
	};
	_this.unarchive = function() {
		if($("#unarchive_button").hasClass("disabled")) return;
		_this.checked_action("/send_to_active", function(status, response) {
			_this.for_each_checked_row(function(row) {
				row.remove();
			});
		});
	};

	// delete worksheet
	_this.delete = function() {
		if($("#delete_button").hasClass("disabled")) return;
		_this.checked_action("/send_to_trash", function(status, response) {
			_this.for_each_checked_row(function(row) {
				row.remove();
			});
		});
	};
	_this.undelete = function() {
		if($("#undelete_button").hasClass("disabled")) return;
		_this.checked_action("/send_to_active", function(status, response) {
			_this.for_each_checked_row(function(row) {
				row.remove();
			});
		});
	};
	_this.stop = function() {
		if($("#stop_button").hasClass("disabled")) return;
		_this.checked_action("/send_to_stop", function(status, response) {
			_this.for_each_checked_row(function(row) {
				row.jquery_this.find(".running_label").fadeOut('slow', function() {
					$(this).detach();
					row.uncheck();
				});
			});
		});
	};

	_this.duplicate = function() {
		if($("#duplicate_button").hasClass("disabled")) return;
		_this.checked_action("/duplicate_worksheet", function(status, response) {
				location.reload();
		});	
	};

	_this.download = function() {
		if($("#download_button").hasClass("disabled")) return;
		// don't download if none are selected
		if(_this.checked_worksheet_filenames().length === 0) return;
		
		window.location.replace("/download_worksheets.zip?filenames=" + encode_response(_this.checked_worksheet_filenames()));
	};
	_this.empty_trash = function() {
		if($("#empty_trash").hasClass("disabled")) return;

		if(confirm(gettext("Emptying the Trash is final. Are you sure?"))) {
			sagenb.async_request("/empty_trash", sagenb.generic_callback(function(status, response) {
				_this.show_trash();
			}), {});
		}
	}
	
	_this.clear_list = function() {
		$("table tbody tr").detach();
		_this.rows = {};
	};
	_this.load = function(params, extra_callback) {
		var url = "/worksheet_list";
		if(params) {
			url += "?" + encodeURI(params);
		}
		
		sagenb.async_request(url, sagenb.generic_callback(function(status, response) {
			_this.clear_list();
			
			var X = decode_response(response);
			for(i in X.worksheets) {
				var row = new sagenb.worksheetlistapp.list_row();
				
				row.props = X.worksheets[i];
				row.list = _this;
				
				_this.rows[row.props.filename] = row;
				
				row.render();
			}
			
			if($("table tbody tr").length === 0) {
				// no rows
				$("tbody").append('<tr class="empty_table_row">' + 
					'<td colspan="4">' + gettext("Nothing here!") + '</td>' + 
				'</tr>');
			}

			if($.isFunction(extra_callback)) {
				extra_callback();
			}
		}));
	};
	
	_this.disable_actions_menu = function() {
		$("#actions_menu button").prop("disabled", true);
		$("#actions_menu, #actions_menu ul li a").addClass("disabled");
	}
	_this.enable_actions_menu = function() {
		$("#actions_menu button").prop("disabled", false);
		$("#actions_menu").removeClass("disabled");
	}
	
	//// VIEWS ////
	_this.show_published = function() {
		_this.load("pub", function() {
			$(".title").text(gettext("Published Worksheets"));
			document.title = gettext("Published Worksheets") + " - POKAL";
			$("#search_input").val("");
			$("#type_buttons li").removeClass('active').find('#show_pub').parent().addClass('active');
		});
	};
	_this.show_active = function() {
		_this.disable_actions_menu();
		_this.load("", function() {
			$(".title").text(gettext("My Notebook"));
			document.title = gettext("My Notebook") + " - POKAL";
			$("#search_input").val("");
			$("#main_checkbox").prop("checked", false);

			_this.enable_actions_menu();
			$("#send_to_archive_button, #delete_button, #stop_button, #download_button, #duplicate_button").removeClass("disabled");
			
			$("#type_buttons li").removeClass('active').find('#show_active').parent().addClass('active');
		});
	};
	_this.show_archive = function() {
		_this.disable_actions_menu();
		_this.load("type=archive", function() {
			$(".title").text(gettext("Archive"));
			document.title = gettext("Archive") + " - POKAL";
			$("#search_input").val("");
			$("#main_checkbox").prop("checked", false);

			_this.enable_actions_menu();
			$("#unarchive_button, #delete_button, #stop_button, #download_button, #duplicate_button").removeClass("disabled");
			
			$("#type_buttons li").removeClass('active').find('#show_archive').parent().addClass('active');
		});
	};
	_this.show_trash = function() {
		_this.disable_actions_menu();
		_this.load("type=trash", function() {
			$(".title").text(gettext("Trash"));
			document.title = gettext("Trash") + " - POKAL";
			$("#search_input").val("");
			$("#main_checkbox").prop("checked", false);

			_this.enable_actions_menu();
			$("#send_to_archive_button, #undelete_button, #stop_button, #download_button, #empty_trash").removeClass("disabled");
			
			$("#type_buttons li").removeClass('active').find('#show_trash').parent().addClass('active');
		});
	};
	_this.do_search = function(event) {
		if (event) event.preventDefault();
		
		var q = $("#search_input").val();
		var search_title, no_search_title, urlq;
		
		if(_this.published_mode) {
			search_title = gettext("Published");
			no_search_title = gettext("Published Worksheets");
			urlq = "pub";
		}
		else {
			var current_id = $("#type_buttons .active a").attr("id");
			switch(current_id) {
				case "show_active":
					search_title = gettext("Active Worksheets");
					no_search_title = gettext("My Notebook");
					urlq = "active";
					break;
				case "show_archive":
					search_title = gettext("Archived Worksheets");
					no_search_title = search_title;
					urlq = "archive";
					break;
				case "show_trash":
					search_title = gettext("Trash");
					no_search_title = search_title;
					urlq = "trash";
					break;
			}
			urlq = "type=" + urlq;
		}
		
		var clear_search = ($.trim(q) === "");
		if(!clear_search) {
			urlq += "&search=" + q;
		}

		_this.load(urlq, function() {
			if(clear_search) {
				document.title = gettext(no_search_title) + " - POKAL";
				$(".title").text(gettext(no_search_title));
			} else {
				document.title = gettext(search_title) + " - " + gettext("Search") + " - POKAL";
				$(".title").text(gettext("Search") + ' in ' + gettext(search_title));
			}
			$("#main_checkbox").prop("checked", false);
		});
	}
};
