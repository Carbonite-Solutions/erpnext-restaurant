# Copyright (c) 2025, Quantum Bit Core and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from erpnext.manufacturing.doctype.work_order.work_order import (make_stock_entry, close_work_order, stop_unstop)
from restaurant_management.restaurant_management.page.restaurant_manage.restaurant_manage import get_completed_items

class FoodOrder(Document):
	def before_save(self):
		previous = self.get_doc_before_save()
		if previous and self.status != previous.status:
			# if self.table_order and self.item:
				# order = frappe.get_doc("Table Order", self.table_order)
				# statues = {
				# 	"Order Placed": "Sent",
				# 	"In Progress": "Attending",
				# 	"Hold": "Attending",
				# 	"Cancelled": "Closed",
				# 	"Finished": "Completed",
				# 	"Delivered": "Delivered",
				# }
				# for row in order.entry_items:
				# 	if row.item_code == self.item:
				# 		row.status = statues[self.status]
				# 		break

				# order.save()

		
			if self.status == "Delivered":
				self.flags.submit_after_save = True

			if self.work_order:
				self.set_work_order()

	def on_update(self):
		if self.has_value_changed("status"):
			get_completed_items()
		if getattr(self.flags, "submit_after_save", False):
			if self.docstatus == 0:
				self.submit()

	def set_work_order(self):
		if self.work_order:
			wo_doc = frappe.get_doc("Work Order", self.work_order)

			if wo_doc.docstatus != 1:
				return

			if wo_doc.status == "Not Started" and self.status == "Attending":
				se_transfer_dict = make_stock_entry(self.work_order, purpose="Material Transfer for Manufacture", qty=self.qty)
				se_transfer_doc = frappe.get_doc(se_transfer_dict)
				se_transfer_doc.save()
				se_transfer_doc.submit()

			if wo_doc.status == "Stopped" and self.status == "Attending":
				stop_unstop(self.work_order, "Resumed")

			if wo_doc.status == "In Process" and self.status == "Completed":
				se_transfer_dict = make_stock_entry(self.work_order, purpose="Manufacture", qty=self.qty)
				se_transfer_doc = frappe.get_doc(se_transfer_dict)
				se_transfer_doc.save()
				se_transfer_doc.submit()
    
			if wo_doc.status == "Completed" and self.status == "Delivered":
				close_work_order(self.work_order, "Closed")

			if wo_doc.status == "In Process" and self.status == "Hold":
				stop_unstop(self.work_order, "Stopped")

			if self.status == "Cancelled":
				if wo_doc.status != "Stopped":
					stop_unstop(self.work_order, "Stopped")
