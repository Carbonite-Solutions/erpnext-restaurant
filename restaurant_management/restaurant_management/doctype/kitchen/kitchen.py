# Copyright (c) 2025, Quantum Bit Core and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from erpnext.manufacturing.doctype.work_order.work_order import make_stock_entry


class Kitchen(Document):
	def before_save(self):
		previous = self.get_doc_before_save()
		if previous and self.status != previous.status:
			if self.table_order and self.item:
				order = frappe.get_doc("Table Order", self.table_order)
				statues = {
					"Order Placed": "Sent",
					"In Progress": "Attending",
					"Finished": "Completed",
					"Delivered": "Delivered"
				}

				for row in order.entry_items:
					if row.item_code == self.item:
						row.status = statues[self.status]
						break

				order.save()

				if self.status == "Finished":
					self.complete_work_order()
		
			if self.status == "Delivered":
				self.flags.submit_after_save = True

	def on_update(self):
		if getattr(self.flags, "submit_after_save", False):
			if self.docstatus == 0:
				self.submit()

	def complete_work_order(self):
		if self.work_order:
			wo_doc = frappe.get_doc("Work Order", self.work_order)
			if wo_doc.status != "Completed":
				se_transfer_dict = make_stock_entry(self.work_order, purpose="Material Transfer for Manufacture")
				se_transfer_doc = frappe.get_doc(se_transfer_dict)
				se_transfer_doc.save()
				se_transfer_doc.submit()

				se_transfer_dict = make_stock_entry(self.work_order, purpose="Manufacture", qty=self.qty)
				se_transfer_doc = frappe.get_doc(se_transfer_dict)
				se_transfer_doc.save()
				se_transfer_doc.submit()
