frappe.pages['kitchen-orders'].on_page_load = function (wrapper) {
    new KitchenOrdersPage(wrapper);
};

class KitchenOrdersPage {
    constructor(wrapper) {
        this.wrapper = wrapper;

        this.page = frappe.ui.make_app_page({
            parent: wrapper,
            title: '🍽️ Kitchen Orders',
            single_column: true
        });

        this.render_kitchen_orders();
    }

    async render_kitchen_orders() {
        const container = $('<div class="kitchen-orders" style="margin-top: 24px;"></div>').appendTo(this.page.body);
        const orders = await this.fetch_kitchen_orders();
        const orderWrapper = $('<div class="order-groups"></div>').appendTo(container);

        if (!orders.length) {
            orderWrapper.append('<p>No Kitchen Orders Found</p>');
            return;
        }

        const groupedOrders = {};
        orders.forEach(order => {
            const tableOrder = order?.table_order || 'No Table';
            if (!groupedOrders[tableOrder]) {
                groupedOrders[tableOrder] = [];
            }
            groupedOrders[tableOrder].push(order);
        });

        const getStatusColor = (status) => {
            switch ((status || '').toLowerCase()) {
                case 'finished':
                case 'delivered':
                    return '#198754';
                case 'in progress':
                    return '#fd7e14';
                case 'order placed':
                    return '#0d6efd';
                default:
                    return '#6c757d';
            }
        };

        Object.keys(groupedOrders).forEach(tableOrder => {
            const group = groupedOrders[tableOrder];

            const groupContainer = $(`
                <div style="margin-bottom: 40px;">
                    <h3 style="margin-bottom: 20px; font-weight: 600; color: #343a40;">Table: ${tableOrder}</h3>
                    <div style="display: flex; gap: 20px; flex-wrap: wrap;"></div>
                </div>
            `).appendTo(orderWrapper);

            const cardContainer = groupContainer.find('div');

            group.forEach(order => {
                const statusColor = getStatusColor(order?.status);
                const statusId = `status-select-${order.name}`;

                const card = $(`
                    <div style="
                        flex: 1 1 320px;
                        padding: 24px;
                        border-radius: 14px;
                        background: #ffffff;
                        border: 1px solid #dee2e6;
                        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
                        border-left: 6px solid ${statusColor};
                        transition: all 0.25s ease;
                        cursor: pointer;
                        color: #212529;
                        font-size: 15px;
                        line-height: 1.5;
                    "
                    class="hoverable-card"
                    onmouseover="this.style.transform='translateY(-5px)'; this.style.boxShadow='0 12px 24px rgba(0,0,0,0.1)';"
                    onmouseout="this.style.transform='none'; this.style.boxShadow='0 6px 20px rgba(0,0,0,0.06)';"
                    >
                        <div style="margin-bottom: 16px;">
                            <h4 style="margin: 0 0 6px; font-size: 18px;">Order: ${order?.name}</h4>
                            <div style="font-size: 13px; color: #6c757d;">Table: ${order?.table_order || '-'}</div>
                        </div>

                        <p style="margin: 10px 0;"><strong>Item:</strong> ${order?.item || '-'}</p>
                        
                        <p style="margin: 10px 0;">
                            <strong>Status:</strong>
                            <select id="${statusId}" style="
                                padding: 6px 12px;
                                border: 1px solid #ced4da;
                                border-radius: 6px;
                                font-size: 14px;
                                margin-left: 6px;
                                background-color: #f8f9fa;
                                color: #343a40;
                            ">
                                <option value="Order Placed" ${order.status === 'Order Placed' ? 'selected' : ''}>Order Placed</option>
                                <option value="In Progress" ${order.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                                <option value="Finished" ${order.status === 'Finished' ? 'selected' : ''}>Finished</option>
                                <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                            </select>
                        </p>

                        <p style="margin: 10px 0;"><strong>Description:</strong> ${order?.item_description || '-'}</p>
                    </div>
                `).appendTo(cardContainer);

                // Bind status change
                setTimeout(() => {
                    $(`#${statusId}`).on('change', function () {
                        const newStatus = $(this).val();
                        frappe.call({
                            method: "frappe.client.set_value",
                            args: {
                                doctype: "Kitchen",
                                name: order.name,
                                fieldname: "status",
                                value: newStatus
                            },
                            callback: function (r) {
                                if (!r.exc) {
                                    frappe.msgprint(`✅ Status updated to <b>${newStatus}</b>`);
                                } else {
                                    frappe.msgprint("❌ Failed to update status");
                                }
                            }
                        });
                    });
                }, 0);
            });
        });
    }

    async fetch_kitchen_orders() {
        try {
            const res = await frappe.call({
                method: 'restaurant_management.restaurant_management.page.kitchen_orders.kitchen_orders.get_kitchen_order',
            });
            return res.message || [];
        } catch (err) {
            frappe.msgprint(__('Failed to fetch kitchen orders'));
            console.error(err);
            return [];
        }
    }
}
