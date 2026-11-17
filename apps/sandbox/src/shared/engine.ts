/*
 * Loads @inkbar/engine, so Download and Print in every scenario hand over the file with the
 * session's annotations and form values written into it. It loads on the first save with
 * changes; a visit that changes nothing never fetches it. The Save and reopen scenario shows the
 * option in place.
 */
export const engine = () => import('@inkbar/engine')
