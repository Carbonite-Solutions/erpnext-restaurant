import frappe

@frappe.whitelist()
def get_kitchen_order():
    orders = frappe.get_all("Kitchen", fields=["name", "item", "table_order", "status", "qty", "item_notes"])

    return orders or []