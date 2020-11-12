/**
 * @license Copyright (c) 2003-2020, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module utils/toarray
 */

/**
 * Transforms any value to an array, if it is not already one. If provided value is already an array, it is returned unchanged.
 *
 * @param {*} [data] Value to transform to an array.
 * @returns {Array} Array created from data.
 */
export default function toArray( data = [] ) {
	return Array.isArray( data ) ? data : [ data ];
}
