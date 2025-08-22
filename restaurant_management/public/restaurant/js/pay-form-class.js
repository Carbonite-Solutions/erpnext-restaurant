class PayForm extends DeskForm {
  payment_methods = {};
  form_name = "Payment Order";
  has_primary_action = false;
  split_type = "none"; // 'none', 'diners', 'amount'
  split_rows = [];

  constructor(options) {
    super(options);

    this.doc_name = this.order.data.name;
    this.title = this.order.data.name;
    this.primary_action = () => {
      this.send_payment();
    };

    this.primary_action_label = __("Pay");

    super.initialize();
  }

  on_reload() {
    this.trigger("is_delivery", "change");
    this.trigger("customer_primary_address", "change");
  }

  get is_delivery() {
    return this.get_value("is_delivery") === 1;
  }

  async set_order_value(fieldname, value) {
    return new Promise(resolve => {
      frappeHelper.api.call({
        model: "Table Order",
        name: this.order.data.name,
        method: "set_" + fieldname,
        args: { fieldname: value },
        always: (r) => {
          resolve(r);
        }
      });
    });
  }

  async make() {
    await super.make();

    this.init_synchronize();

    const set_address_query = () => {
      this.set_field_property("address", "get_query", () => {
        return {
          filters: {
            'link_doctype': 'Customer',
            'link_name': this.get_value("customer"),
          }
        }
      });
    }

    this.on("charge_amount", "change", (field) => {
      if (this.order.data.charge_amount !== field.get_value()) {
        this.order.data.is_delivery = this.get_value("is_delivery");
        this.order.data.delivery_branch = this.get_value("delivery_branch");
        this.order.data.charge_amount = field.get_value();
        this.order.aggregate(true);

        super.save({}, true);
      }
    });

    this.on("related_branch", "change", (field) => {
      this.set_value("branch", field.get_value());
    });

    this.on(["delivery_branch", "address"], "change", () => {
      const set_reqd_status = delivery_branch => {
        if (this.is_delivery) {
          if (delivery_branch) {
            this.set_field_property(["delivery_date", "pick_time", "branch"], "reqd", 1);
            this.set_field_property("address", "reqd", 0);
          } else {
            this.set_field_property(["delivery_date", "pick_time", "branch"], "reqd", 0);
            this.set_field_property("address", "reqd", 1);
          }
        } else {
          this.set_field_property(["delivery_date", "pick_time", "branch", "address"], "reqd", 0);
        }
      }

      if (this.get_value("delivery_branch") === 1) {
        this.set_field_property("branch", {
          read_only: 0,
          reqd: 1,
        });

        set_reqd_status(this.get_value("delivery_branch") === 1);

        ["delivery_date", "pick_time"].forEach(fieldname => {
          this.get_field(fieldname).$wrapper.show();
        });

        ["delivery_address", "charge_amount"].forEach(fieldname => {
          this.get_field(fieldname).$wrapper.hide();
        });
      } else {
        this.set_field_property("branch", {
          read_only: 1,
          reqd: 0,
        });

        set_reqd_status(this.get_value("delivery_branch") === 1);

        ["delivery_date", "pick_time"].forEach(fieldname => {
          this.get_field(fieldname).$wrapper.hide();
        });

        ["delivery_address", "charge_amount"].forEach(fieldname => {
          this.get_field(fieldname).$wrapper.show();
        });
      }

      this.get_delivery_address();
    });

    const set_related = (from, to) => {
      const from_value = this.get_value(from);
      this.set_value(to, from_value);
    }

    this.on("is_delivery", "change", (field) => {
      if (field.get_value() === 1) {
        this.get_field("delivery_options").wrapper[0].style.display = "block";
        this.set_field_property("dinners", "reqd", 0);
        this.get_field("dinners").$wrapper.hide();
      } else {
        this.get_field("delivery_options").wrapper[0].style.display = "none";
        this.set_field_property(["delivery_date", "pick_time", "branch", "address"], "reqd", 0);
        this.set_field_property("dinners", "reqd", 1);
        this.get_field("dinners").$wrapper.show();
      }

      this.trigger("charge_amount", "change");
    });

    this.on("customer", "change", () => {
      this.order.data.customer = this.get_value("customer");
    });

    this.on("customer_primary_address", "change", () => {
      set_related("customer_primary_address", "address");
    });

    this.on("address_branch", "change", () => {
      set_related("address_branch", "branch");
    });

    this.get_field("notes").input.style.height = "80px";
    this.get_field("column").$wrapper.css("height", "37px");

    this.hide_support_elements();

    set_address_query();

    this.make_actions();

    setTimeout(() => {
      this.disable_input("payment_button", !RM.can_pay);
      this.trigger(["delivery_branch", "is_delivery"], "change");
    }, 0);
    setTimeout(() => {
      this.make_inputs();
    }, 300);
  }

  make_actions() {
    [
      { name: "save", label: "Save", type: "success" },
      { name: "send_order", label: "Order", type: "success", icon: "fa fa-cutlery" },
      { name: "cancel", label: "Cancel", type: "danger", icon: "fa fa-times" },
      { name: "pay", label: "Pay", type: "info", icon: "fa fa-money", confirm: !RM.restrictions.to_pay ? DOUBLE_CLICK : null },
    ].forEach(action => {
      this.add_action(action, () => {
        this[action.name]();
      });
    });

    this.actions.pay.prop("disabled", !RM.can_pay);
  }

  /**Actions **/
  save() {
    super.save({
      success: () => {
        this.order.select(true, false);
        RM.ready("Order Placed");
      }
    });
  }

  send_order() {
    frappe.confirm(__("This action sent all order to Production Center,<br><strong>Do you want to continue?</strong>"), () => {
      frappe.db.set_value("Table Order", this.order.data.name, "status", "Sent");
    });
  }

  cancel() {
    frappe.confirm(__("Do you want to cancel Order?</strong>"), () => {
      frappe.db.set_value("Table Order", this.order.data.name, "status", "Cancelled");
    });
  }

  pay() {
    if (!RM.can_pay) return;
    // this.actions.pay.disable().val(__("Paying"));
    this.send_payment();
  }
  /**Actions */

  disable_input(input, value = true) {
    const field = this.get_field(input);
    field && field.input && (field.input.disabled = value);
  }

  enable_input(input) {
    const field = this.get_field(input);
    field && field.input && (field.input.disabled = false);
  }

  hide_support_elements() {
    ["customer_primary_address", "address_branch", "related_branch", "amount"].forEach(fieldname => {
      this.get_field(fieldname).$wrapper.hide();
    });
  }

  async get_delivery_address() {
    this.order.data.address = this.get_value("address");

    if (this.get_value("delivery_branch") === 1) {
      this.set_value("delivery_address", "");
      this.set_value("charge_amount", 0);
    } else {
      const address = await this.order.get_delivery_address();

      this.set_value("delivery_address", address.address || "");
      this.set_value("charge_amount", address.charges || 0);
    };
  }

  init_synchronize() {
    frappe.realtime.on("pos_profile_update", () => {
      this.hide();
    });
  }

  async reload() {
    await super.reload(null, true);
    this.update_paid_value();
  }

  make_inputs() {
    let payment_methods = "";
    RM.pos_profile.payments.forEach(mode_of_payment => {
      this.payment_methods[mode_of_payment.mode_of_payment] = frappe.jshtml({
        tag: "input",
        properties: {
          type: "text",
          class: `input-with-feedback form-control bold`
        },
      }).on(["change", "keyup"], () => {
        // Prevent negative values
        const value = parseFloat(this.payment_methods[mode_of_payment.mode_of_payment].val());
        if (value < 0) {
          this.payment_methods[mode_of_payment.mode_of_payment].val(0);
        }
        this.update_paid_value();
      }).on("click", (obj) => {
        this.order.order_manage.num_pad.input = obj;
      }).float();

      if (mode_of_payment.default === 1) {
        this.payment_methods[mode_of_payment.mode_of_payment].val(this.order.data.amount);

        setTimeout(() => {
          this.payment_methods[mode_of_payment.mode_of_payment].select();
          this.order.order_manage.num_pad.input = this.payment_methods[mode_of_payment.mode_of_payment];
        }, 200);
      }

      payment_methods += this.form_tag(
        mode_of_payment.mode_of_payment, this.payment_methods[mode_of_payment.mode_of_payment]
      );
    });

    this.get_field("payment_methods").$wrapper.empty().append(payment_methods);

    // Add split billing options
    this.add_split_billing_options();
    
    this.update_paid_value();
  }

  add_split_billing_options() {
    const splitOptions = $(`
      <div class="form-group">
        <label>${__("Split Billing")}</label>
        <div class="checkbox">
          <label>
            <input type="radio" name="split_type" value="none" checked> ${__("No Split")}
          </label>
        </div>
        <div class="checkbox">
          <label>
            <input type="radio" name="split_type" value="diners"> ${__("Split by Number of Diners")}
          </label>
        </div>
        <div class="checkbox">
          <label>
            <input type="radio" name="split_type" value="amount"> ${__("Split by Amount")}
          </label>
        </div>
      </div>
      <div id="split_diners_section" style="display:none; margin-top:10px;"></div>
      <div id="split_amount_section" style="display:none; margin-top:10px;"></div>
    `);

    this.get_field("payment_methods").$wrapper.prepend(splitOptions);

    // Handle split type changes
    $("input[name='split_type']").on("change", (e) => {
      this.split_type = e.target.value;
      this.handle_split_type_change();
    });

    // Initialize split sections
    this.init_split_diners_section();
    this.init_split_amount_section();
  }

  handle_split_type_change() {
    $("#split_diners_section").toggle(this.split_type === "diners");
    $("#split_amount_section").toggle(this.split_type === "amount");
    
    if (this.split_type === "none") {
      this.clear_split_inputs();
    } else if (this.split_type === "diners") {
      this.update_diners_split();
    }
  }

  init_split_diners_section() {
    const section = $("#split_diners_section");
    section.html(`
      <div class="form-group">
        <label>${__("Number of Diners")}</label>
        <input type="number" id="num_diners" class="form-control" min="1" max="10" value="1">
      </div>
      <div id="diners_split_summary" class="alert alert-info mt-2"></div>
    `);

    $("#num_diners").on("input", () => {
      this.update_diners_split();
    });
  }

  update_diners_split() {
    const num_diners = parseInt($("#num_diners").val()) || 1;
    const total_amount = this.order.data.amount || 0;
    const per_diner = (total_amount / num_diners).toFixed(2);
    
    let summary = `<strong>${__("Split Summary")}</strong><br>`;
    summary += `${__("Total Amount")}: ${frappe.format(total_amount, "Currency")}<br>`;
    summary += `${__("Number of Diners")}: ${num_diners}<br>`;
    summary += `${__("Amount per Diner")}: ${frappe.format(per_diner, "Currency")}<br><br>`;
    
    // Create payment method selection for each diner
    let paymentOptions = '';
    RM.pos_profile.payments.forEach(mode => {
      paymentOptions += `<option value="${mode.mode_of_payment}">${mode.mode_of_payment}</option>`;
    });
    
    summary += `<table class="table table-bordered" style="font-size: 12px;">`;
    summary += `<tr><th>${__("Diner")}</th><th>${__("Amount")}</th><th>${__("Payment Method")}</th></tr>`;
    
    for (let i = 1; i <= num_diners; i++) {
      summary += `
        <tr>
          <td>${__("Diner")} ${i}</td>
          <td>${frappe.format(per_diner, "Currency")}</td>
          <td>
            <select class="form-control input-sm diner-payment-method" data-diner="${i}">
              ${paymentOptions}
            </select>
          </td>
        </tr>
      `;
    }
    
    summary += `</table>`;
    
    $("#diners_split_summary").html(summary);
  }

  init_split_amount_section() {
    const section = $("#split_amount_section");
    section.html(`
      <div class="form-group">
        <label>${__("Split Amounts")}</label>
        <table class="table table-bordered" id="split_amount_table">
          <thead>
            <tr>
              <th>${__("Part")}</th>
              <th>${__("Amount")}</th>
              <th>${__("Payment Method")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
        <button id="add_split_row" class="btn btn-default btn-sm">
          <i class="fa fa-plus"></i> ${__("Add Split")}
        </button>
        <div id="amount_split_summary" class="alert alert-info mt-2"></div>
      </div>
    `);

    // Add first row by default
    this.add_split_amount_row();
    
    $("#add_split_row").on("click", () => {
      this.add_split_amount_row();
    });
  }

  add_split_amount_row() {
    const tbody = $("#split_amount_table tbody");
    const rowCount = tbody.find("tr").length;
    const rowId = `split_row_${rowCount + 1}`;
    
    // Create payment method options
    let paymentOptions = '';
    RM.pos_profile.payments.forEach(mode => {
      paymentOptions += `<option value="${mode.mode_of_payment}">${mode.mode_of_payment}</option>`;
    });
    
    const row = $(`
      <tr id="${rowId}">
        <td>Part ${rowCount + 1}</td>
        <td><input type="number" class="form-control split-amount" min="0" step="0.01"></td>
        <td>
          <select class="form-control split-payment-method">
            ${paymentOptions}
          </select>
        </td>
        <td>
          <button class="btn btn-danger btn-xs remove-split-row">
            <i class="fa fa-times"></i>
          </button>
        </td>
      </tr>
    `);
    
    tbody.append(row);
    
    // Add remove event
    row.find(".remove-split-row").on("click", () => {
      row.remove();
      this.update_amount_split_summary();
    });
    
    // Add amount change event
    row.find(".split-amount").on("input", () => {
      this.update_amount_split_summary();
    });
    
    this.update_amount_split_summary();
  }

  update_amount_split_summary() {
    const total_amount = this.order.data.amount || 0;
    let split_total = 0;
    
    $("#split_amount_table tbody tr").each(function() {
      const amount = parseFloat($(this).find(".split-amount").val()) || 0;
      split_total += amount;
    });
    
    let summary = `<strong>${__("Split Summary")}</strong><br>`;
    summary += `${__("Total Amount")}: ${frappe.format(total_amount, "Currency")}<br>`;
    summary += `${__("Split Total")}: ${frappe.format(split_total, "Currency")}<br>`;
    
    if (split_total !== total_amount) {
      summary += `<span style="color:red;">${__("Split amounts must equal total amount")}</span>`;
    }
    
    $("#amount_split_summary").html(summary);
  }

  clear_split_inputs() {
    // Clear any split-related inputs when no split is selected
    $("#split_diners_section").hide();
    $("#split_amount_section").hide();
  }

  form_tag(label, input) {
    return `
        <div class="form-group">
            <div class="clearfix">
                <label class="control-label" style="padding-right: 0;">${__(label)}</label>
            </div>
            <div class="control-input-wrapper">
                ${input.html()}
            </div>
         </div>`
  }

  get payments_values() {
    if (this.split_type === "none") {
      // Original payment handling
      const payment_values = {};
      RM.pos_profile.payments.forEach((mode_of_payment) => {
        let value = this.payment_methods[mode_of_payment.mode_of_payment].float_val;
        if (value > 0) {
          payment_values[mode_of_payment.mode_of_payment] = value;
        }
      });
      return payment_values;
    } else if (this.split_type === "diners") {
      const num_diners = parseInt($("#num_diners").val()) || 1;
      const per_diner = (this.order.data.amount / num_diners).toFixed(2);
      
      // Create payment entries for each diner with their selected payment method
      const split_payments = [];
      
      for (let i = 1; i <= num_diners; i++) {
        const paymentMethod = $(`.diner-payment-method[data-diner="${i}"]`).val();
        split_payments.push({
          mode_of_payment: paymentMethod,
          amount: parseFloat(per_diner)
        });
      }
      
      return {
        split_type: "diners",
        num_diners: num_diners,
        payments: split_payments
      };
    } else if (this.split_type === "amount") {
      // Split by amount - custom amounts from table
      const split_payments = [];
      let valid = true;
      
      $("#split_amount_table tbody tr").each(function() {
        const amount = parseFloat($(this).find(".split-amount").val()) || 0;
        const method = $(this).find(".split-payment-method").val();
        
        if (amount > 0) {
          split_payments.push({
            amount: amount,
            mode_of_payment: method
          });
        }
      });
      
      // Validate the total
      const split_total = split_payments.reduce((sum, item) => sum + item.amount, 0);
      if (Math.abs(split_total - this.order.data.amount) > 0.01) {
        frappe.msgprint(__("Split amounts must equal the total bill amount"));
        valid = false;
      }
      
      return valid ? {
        split_type: "amount",
        payments: split_payments
      } : null;
    }
  }

  // Add validation method
  validate_payments() {
    const payment_args = this.payments_values;
    
    if (!payment_args) {
      frappe.msgprint(__("Please configure split billing correctly."));
      return false;
    }
    
    if (this.split_type === "none") {
      // Check if at least one payment method has amount > 0
      const hasValidPayment = Object.values(payment_args).some(amount => amount > 0);
      
      if (!hasValidPayment) {
        frappe.msgprint(__("At least one mode of payment is required for POS invoice."));
        return false;
      }
    } else if (this.split_type === "diners") {
      // For diners split, we already have payments configured
      const num_diners = parseInt($("#num_diners").val()) || 0;
      if (num_diners < 1) {
        frappe.msgprint(__("Number of diners must be at least 1."));
        return false;
      }
    } else if (this.split_type === "amount") {
      // For amount split, validate that payments total equals order amount
      const total_amount = this.order.data.amount || 0;
      const split_total = payment_args.payments.reduce((sum, item) => sum + item.amount, 0);
      
      if (Math.abs(split_total - total_amount) > 0.01) {
        frappe.msgprint(__("Split amounts must equal the total bill amount."));
        return false;
      }
      
      if (payment_args.payments.length === 0) {
        frappe.msgprint(__("At least one split payment is required."));
        return false;
      }
    }
    
    return true;
  }

  send_payment() {
    RM.working("Saving Invoice");
    
    // Validate that at least one payment method has a value
    if (!this.validate_payments()) {
      RM.ready();
      return;
    }
    
    this.#send_payment();
  }

  reset_payment_button() {
    RM.ready();
    if (!RM.can_pay) {
      this.actions.pay.disable();
      return;
    }
    this.actions.pay.enable().val(__("Pay"));
  }

  #send_payment() {
    if (!RM.can_pay) return;
    const order_manage = this.order.order_manage;

    RM.working("Saving Invoice");

    super.save({
      success: (r) => {
        // Revalidate payments before processing
        if (!this.validate_payments()) {
          RM.ready();
          this.reset_payment_button();
          return;
        }
        
        RM.working("Paying Invoice");
        
        const payment_args = this.payments_values;
        
        frappeHelper.api.call({
          model: "Table Order",
          name: this.order.data.name,
          method: "make_invoice",
          args: {
            mode_of_payment: payment_args,
            split_type: this.split_type
          },
          always: (r) => {
            RM.ready();
            this.reset_payment_button();

            if (r.message && r.message.status) {
              order_manage.clear_current_order();
              order_manage.check_buttons_status();
              order_manage.check_item_editor_status();

              this.hide();
              this.print(r.message.invoice_name);
              order_manage.make_orders();
            }
          },
          freeze: true
        });
      },
      error: (r) => {
        RM.ready();
        this.reset_payment_button();
        if (r !== false && typeof r === "string") {
          frappe.msgprint(r);
        }
      }
    });
  }

  print(invoice_name) {
    if (!RM.can_pay) return;

    const title = invoice_name + " (" + __("Print") + ")";
    const order_manage = this.order.order_manage;

    const props = {
      model: "POS Invoice",
      model_name: invoice_name,
      args: {
        format: RM.pos_profile.print_format,
        _lang: RM.lang,
        no_letterhead: RM.pos_profile.letter_head || 1,
        letterhead: RM.pos_profile.letter_head || 'No%20Letterhead'
      },
      from_server: true,
      set_buttons: true,
      is_pdf: true,
      customize: true,
      title: title
    };

    if (order_manage.print_modal) {
      order_manage.print_modal.set_props(props);
      order_manage.print_modal.set_title(title);
      order_manage.print_modal.reload().show();
    } else {
      order_manage.print_modal = new DeskModal(props);
    }
  }

  update_paid_value() {
    let total = 0;

    setTimeout(() => {
      Object.keys(this.payment_methods).forEach((payment_method) => {
        total += this.payment_methods[payment_method].float_val;
      });

      this.set_value("total_payment", total);
      this.set_value("change_amount", (total - this.order.amount));
    }, 0);
  }

  set_value(field, value) {
    super.set_value(field, value);
    if (field === "amount") {
      this.set_total_payment();
    }
  }

  set_total_payment() {
    if (this.actions.pay) {
      this.actions.pay.set_content(`<span style="font-size: 25px; font-weight: 400">{{text}} ${this.order.total_money}</span>`);
      this.actions.pay.val(__("Pay"));
    }
  }
  
  hide() {
    super.hide && super.hide();

    // Force remove backdrop and modal-open class
    $('.modal-backdrop').remove();
    $('body').removeClass('modal-open');
  }
}