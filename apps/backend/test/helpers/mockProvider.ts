import { MockAdapterBase } from "../../src/modules/providers/adapters/mock.base";
import { registerAdapter } from "../../src/modules/providers/provider.registry";

/** Provider code tests route through. Never registered in production code. */
export const TEST_PROVIDER_CODE = "test_mock";

class TestMockAdapter extends MockAdapterBase {
  readonly code = TEST_PROVIDER_CODE;
}

registerAdapter(new TestMockAdapter());
