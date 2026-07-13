# Database Schema — Revision 1.1

## Change Summary

Added **Structured Item Attributes** for production filtering.

### Production Attribute Index

Every Order Item shall also store searchable attributes in addition to the full configuration snapshot.

Examples:

- product_definition_id
- category
- size
- tree_color
- bow_color
- family_name
- year
- icon
- pet_count
- people_count
- production_status
- fulfillment_method

`configuration_json` remains the complete historical record.

Structured attributes exist only to support fast searching, filtering, reporting, and production batching.

### Production Filtering Requirements

Forge Version 1 must allow staff to filter by:

- Product
- Ornament type
- Size
- Tree color
- Bow color
- Year
- Production status
- Shipping / Pickup
- Event
- Open production flags

### Production Counts

Forge should support grouped production counts such as:

- Tree Ornament / Large / Green / Red Bow
- Present Stack / Red Bow
- Veteran Flag
- Custom Icons Required

This update supplements the existing Database_Schema.md.
