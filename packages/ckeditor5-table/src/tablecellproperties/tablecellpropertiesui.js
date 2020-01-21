/**
 * @license Copyright (c) 2003-2019, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module table/tablecellpropertiesui
 */

import Plugin from '@ckeditor/ckeditor5-core/src/plugin';
import ButtonView from '@ckeditor/ckeditor5-ui/src/button/buttonview';
import { getTableWidgetAncestor } from '../utils';
import clickOutsideHandler from '@ckeditor/ckeditor5-ui/src/bindings/clickoutsidehandler';
import ContextualBalloon from '@ckeditor/ckeditor5-ui/src/panel/balloon/contextualballoon';
import TableCellPropertiesView from './ui/tablecellpropertiesview';
import tableCellProperties from './../../theme/icons/table-cell-properties.svg';
import { repositionContextualBalloon, getBalloonCellPositionData } from '../ui/utils';

const DEFAULT_BORDER_STYLE = 'none';
const DEFAULT_HORIZONTAL_ALIGNMENT = 'left';
const DEFAULT_VERTICAL_ALIGNMENT = 'middle';
const CELL_PROPERTIES = [
	'borderStyle', 'borderColor', 'borderWidth',
	'padding', 'backgroundColor',
	'horizontalAlignment', 'verticalAlignment',
];

/**
 * The table cell properties UI plugin. It introduces the `'tableCellProperties'` button
 * that opens a form allowing to specify visual styling of a table cell.
 *
 * It uses the
 * {@link module:ui/panel/balloon/contextualballoon~ContextualBalloon contextual balloon plugin}.
 *
 * @extends module:core/plugin~Plugin
 */
export default class TableCellPropertiesUI extends Plugin {
	/**
	 * @inheritDoc
	 */
	static get requires() {
		return [ ContextualBalloon ];
	}

	/**
	 * @inheritDoc
	 */
	static get pluginName() {
		return 'TableCellPropertiesUI';
	}

	/**
	 * @inheritDoc
	 */
	init() {
		const editor = this.editor;
		const t = editor.t;

		/**
		 * The contextual balloon plugin instance.
		 *
		 * @private
		 * @member {module:ui/panel/balloon/contextualballoon~ContextualBalloon}
		 */
		this._balloon = editor.plugins.get( ContextualBalloon );

		/**
		 * The cell properties form view displayed inside the balloon.
		 *
		 * @member {module:table/ui/tablecellpropertiesview~TableCellPropertiesView}
		 */
		this.view = this._createPropertiesView();

		/**
		 * The batch used to undo all changes made by the form (which are live, as the user types)
		 * when "Cancel" was pressed. Each time the view is shown, a new batch is created.
		 *
		 * @private
		 * @member {module:engine/model/batch~Batch}
		 */
		this._batch = null;

		// Make the form dynamic, i.e. create bindings between view fields and the model.
		this._startRespondingToChangesInView();

		editor.ui.componentFactory.add( 'tableCellProperties', locale => {
			const view = new ButtonView( locale );

			view.set( {
				label: t( 'Cell properties' ),
				icon: tableCellProperties,
				tooltip: true
			} );

			this.listenTo( view, 'execute', () => this._showView() );

			return view;
		} );
	}

	/**
	 * @inheritDoc
	 */
	destroy() {
		super.destroy();

		// Destroy created UI components as they are not automatically destroyed.
		// See https://github.com/ckeditor/ckeditor5/issues/1341.
		this.view.destroy();
	}

	/**
	 * Creates the {@link module:table/ui/tablecellpropertiesview~TableCellPropertiesView} instance.
	 *
	 * @private
	 * @returns {module:table/ui/tablecellpropertiesview~TableCellPropertiesView} The cell properties form
	 * view instance.
	 */
	_createPropertiesView() {
		const editor = this.editor;
		const viewDocument = editor.editing.view.document;
		const view = new TableCellPropertiesView( editor.locale );

		// Render the view so its #element is available for the clickOutsideHandler.
		view.render();

		this.listenTo( view, 'submit', () => {
			this._hideView();
		} );

		this.listenTo( view, 'cancel', () => {
			editor.execute( 'undo', this._batch );
			this._hideView();
		} );

		// Close the balloon on Esc key press when the **form has focus**.
		view.keystrokes.set( 'Esc', ( data, cancel ) => {
			this._hideView();
			cancel();
		} );

		// Reposition the balloon or hide the form if an image widget is no longer selected.
		this.listenTo( editor.ui, 'update', () => {
			if ( !getTableWidgetAncestor( viewDocument.selection ) ) {
				this._hideView();
			} else if ( this._isViewVisible ) {
				repositionContextualBalloon( editor );
			}
		} );

		// Close on click outside of balloon panel element.
		clickOutsideHandler( {
			emitter: view,
			activator: () => this._isViewInBalloon,
			contextElements: [ this._balloon.view.element ],
			callback: () => this._hideView()
		} );

		return view;
	}

	/**
	 * In this method the UI -> editor data binding is registered.
	 *
	 * Registers a listener that updates the editor data when any observable property of
	 * the {@link #view} has changed. This makes the view live, which means the changes are
	 * visible in the editing as soon as the user types or changes fields' values.
	 *
	 * @private
	 */
	_startRespondingToChangesInView() {
		const editor = this.editor;

		this.view.on( 'change', ( evt, propertyName, newValue ) => {
			// Not all observable properties of the #view must be related to the cell editing.
			// For instance, they can belong to some internal logic.
			if ( !CELL_PROPERTIES.includes( propertyName ) ) {
				return;
			}

			editor.execute( propertyNameToCommandName( propertyName ), {
				value: newValue,
				batch: this._batch
			} );
		} );
	}

	/**
	 * In this method the editor data -> UI binding is happening.
	 *
	 * When executed, this method obtains selected cell property values from various table commands
	 * and passes them to the {@link #view}.
	 *
	 * This way, the UI stays up–to–date with the editor data.
	 *
	 * @private
	 */
	_fillViewFormFromCommandValues() {
		const editor = this.editor;
		const data = {};

		for ( const propertyName of CELL_PROPERTIES ) {
			let value = editor.commands.get( propertyNameToCommandName( propertyName ) ).value;

			if ( !value ) {
				if ( propertyName === 'borderStyle' ) {
					value = DEFAULT_BORDER_STYLE;
				} else if ( propertyName === 'horizontalAlignment' ) {
					value = DEFAULT_HORIZONTAL_ALIGNMENT;
				} else if ( propertyName === 'verticalAlignment' ) {
					value = DEFAULT_VERTICAL_ALIGNMENT;
				} else {
					value = '';
				}
			}

			data[ propertyName ] = value;
		}

		this.view.set( data );
	}

	/**
	 * Shows the {@link #view} in the {@link #_balloon}.
	 *
	 * **Note**: Each time a view is shown, the new {@link #_batch} is created that contains
	 * all changes made to the document when the view is visible, allowing a single undo step
	 * for all of them.
	 *
	 * @private
	 */
	_showView() {
		if ( this._isViewVisible ) {
			return;
		}

		const editor = this.editor;

		if ( !this._isViewInBalloon ) {
			this._balloon.add( {
				view: this.view,
				position: getBalloonCellPositionData( editor )
			} );
		}

		// Create a new batch. Clicking "Cancel" will undo this batch.
		this._batch = editor.model.createBatch();

		// Update the view with the model values.
		this._fillViewFormFromCommandValues();

		// Basic a11y.
		this.view.focus();
	}

	/**
	 * Removes the {@link #view} from the {@link #_balloon}.
	 *
	 * @private
	 */
	_hideView() {
		if ( !this._isViewInBalloon ) {
			return;
		}

		const editor = this.editor;

		this.stopListening( editor.ui, 'update' );
		this.stopListening( this._balloon, 'change:visibleView' );

		// Make sure the focus always gets back to the editable _before_ removing the focused properties view.
		// Doing otherwise causes issues in some browsers. See https://github.com/ckeditor/ckeditor5-link/issues/193.
		editor.editing.view.focus();

		if ( this._isViewInBalloon ) {
			// Blur any input element before removing it from DOM to prevent issues in some browsers.
			// See https://github.com/ckeditor/ckeditor5/issues/1501.
			this.view.saveButtonView.focus();

			this._balloon.remove( this.view );

			// Because the form has an input which has focus, the focus must be brought back
			// to the editor. Otherwise, it would be lost.
			this.editor.editing.view.focus();
		}
	}

	/**
	 * Returns `true` when the {@link #view} is the visible in the {@link #_balloon}.
	 *
	 * @private
	 * @type {Boolean}
	 */
	get _isViewVisible() {
		return this._balloon.visibleView === this.view;
	}

	/**
	 * Returns `true` when the {@link #view} is in the {@link #_balloon}.
	 *
	 * @private
	 * @type {Boolean}
	 */
	get _isViewInBalloon() {
		return this._balloon.hasView( this.view );
	}
}

// Translates view's properties into command names.
//
//		'borderWidth' -> 'tableCellBorderWidth'
//
// @param {String} propertyName
function propertyNameToCommandName( propertyName ) {
	return `tableCell${ propertyName[ 0 ].toUpperCase() }${ propertyName.slice( 1 ) }`;
}
