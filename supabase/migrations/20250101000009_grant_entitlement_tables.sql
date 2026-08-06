-- Grant table-level access to authenticated role for entitlement tables.
-- RLS policies (from migration 000008) control row-level access.
-- Validates: Requirements 28.1

-- entitlement_levels: Read-only reference table for all authenticated users
GRANT SELECT ON entitlement_levels TO authenticated;

-- feature_entitlements: Read-only reference table for all authenticated users
GRANT SELECT ON feature_entitlements TO authenticated;

-- user_entitlements: Users can manage their own entitlement records
GRANT SELECT, INSERT, UPDATE, DELETE ON user_entitlements TO authenticated;
