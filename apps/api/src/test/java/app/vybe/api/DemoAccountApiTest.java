package app.vybe.api;

import app.vybe.api.support.ApiTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** The demo account's password is public: anything that could lock others out or expose files is refused. */
class DemoAccountApiTest extends ApiTestBase {

    @Test
    void demoAccountCannotBeLockedRenamedDeletedOrUsedForUploads() throws Exception {
        String demo = signInDemo();
        mvc.perform(get("/api/me/settings").cookie(cookie(demo))).andExpect(jsonPath("$.isDemo").value(true));
        mvc.perform(put("/api/me/password").cookie(cookie(demo)).contentType("application/json")
                        .content("{\"currentPassword\":\"vybe1234\",\"newPassword\":\"taken-over-1\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("demo_account"));
        mvc.perform(patch("/api/me").cookie(cookie(demo)).contentType("application/json").content("{\"displayName\":\"Hacked\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("demo_account"));
        mvc.perform(delete("/api/me").cookie(cookie(demo)).contentType("application/json").content("{\"password\":\"vybe1234\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("demo_account"));
        mvc.perform(multipart("/api/me/imports").file(new MockMultipartFile("files", "a.mp3", "audio/mpeg", new byte[]{1, 2, 3})).cookie(cookie(demo)))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("demo_account"));
        // The demo can still sign in afterwards with the published password.
        mvc.perform(post("/api/auth/signin").contentType("application/json")
                .content("{\"email\":\"demo@vybe.app\",\"password\":\"vybe1234\"}")).andExpect(status().isOk());
    }

    @Test
    void regularAccountsAreNotFlaggedAsDemo() throws Exception {
        mvc.perform(get("/api/me/settings").cookie(cookie(newUserSession()))).andExpect(jsonPath("$.isDemo").value(false));
    }
}
