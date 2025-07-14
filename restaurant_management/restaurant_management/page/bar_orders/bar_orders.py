import frappe

@frappe.whitelist()
def get_bar_order():
    orders = frappe.get_all("Bar", fields=["name", "item", "qty", "status", "item_notes"])
    return orders or []
