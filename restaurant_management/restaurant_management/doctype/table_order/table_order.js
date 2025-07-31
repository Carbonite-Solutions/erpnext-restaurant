// Copyright (c) 2021, Quantum Bit Core and contributors
// For license information, please see license.txt

frappe.ui.form.on('Table Order', {
	// refresh: function(frm) {

	// }
});

frappe.ui.form.on('Order Entry Item', {
	status: function(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if(row.status) {
			frappe.call({
				method: "change_kitchen_status",
				doc: frm.doc,
				args: {
					"status": row.status,
					"order_name": row.food_order
				},
				callback(r) {

				}
			})
		}
	}
})
