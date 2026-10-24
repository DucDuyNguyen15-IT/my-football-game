-- Sổ cái xu là append-only (ARCHITECTURE §3.2): chặn mọi UPDATE/DELETE ở mức DB.
CREATE FUNCTION coin_transactions_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'coin_transactions là append-only: không được % dòng', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER coin_transactions_append_only
BEFORE UPDATE OR DELETE ON coin_transactions
FOR EACH ROW EXECUTE FUNCTION coin_transactions_append_only();
