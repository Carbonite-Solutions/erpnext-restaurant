# Copyright (c) 2025, Quantum Bit Core and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from restaurant_management.restaurant_management.page.restaurant_manage.restaurant_manage import get_completed_items


class Bar(Document):
	def before_save(self):
		previous = self.get_doc_before_save()
		if previous and self.status != previous.status:
			if self.table_order and self.item:
				order = frappe.get_doc("Table Order", self.table_order)
				statues = {
					"Order Placed": "Sent",
					"In Progress": "Attending",
					"Hold": "Attending",
					"Cancelled": "Closed",
					"Finished": "Completed",
					"Delivered": "Delivered",
				}
				for row in order.entry_items:
					if row.item_code == self.item:
						row.status = statues[self.status]
						break

				order.save()

	def on_update(self):
		if self.has_value_changed("status"):
			get_completed_items()