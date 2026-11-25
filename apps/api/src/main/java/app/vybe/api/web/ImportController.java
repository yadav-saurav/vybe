package app.vybe.api.web;

import app.vybe.api.auth.CurrentUser;
import app.vybe.api.imports.ImportService;
import app.vybe.api.model.Pages;
import app.vybe.api.model.User;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;
import java.util.List;

/**
 * Music imported from the user's own computer. Everything is owner-only: anonymous requests get 401,
 * and another user's track id answers 404 exactly like an unknown one.
 */
@RestController
public class ImportController {

    private final ImportService imports;

    public ImportController(ImportService imports) {
        this.imports = imports;
    }

    @PostMapping(value = "/api/me/imports", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ImportService.UploadResult upload(@CurrentUser User user,
                                             @RequestParam(value = "files", required = false) List<MultipartFile> files) {
        return imports.upload(user.id(), files);
    }

    @GetMapping("/api/me/imports")
    public Pages.Songs list(@CurrentUser User user) {
        return new Pages.Songs(imports.list(user.id()));
    }

    @DeleteMapping("/api/me/imports/{id}")
    public Pages.Ok delete(@CurrentUser User user, @PathVariable String id) {
        imports.delete(user.id(), id);
        return Pages.Ok.YES;
    }

    /** Same mechanism as {@code /api/stream}: a {@link Resource} body, so Spring MVC serves Range (206/416). */
    @GetMapping("/api/imports/{id}/stream")
    public ResponseEntity<Resource> stream(@CurrentUser User user, @PathVariable String id) {
        ImportService.Audio audio = imports.audio(user.id(), id);
        if (audio.redirect() != null) {
            return ResponseEntity.status(302).location(audio.redirect()).cacheControl(CacheControl.noStore()).build();
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate())
                .contentType(MediaType.parseMediaType(audio.mime()))
                .body(audio.resource());
    }

    @GetMapping("/api/imports/{id}/artwork")
    public ResponseEntity<Resource> artwork(@CurrentUser User user, @PathVariable String id) {
        ImportService.Image image = imports.artwork(user.id(), id);
        if (image.redirect() != null) {
            return ResponseEntity.status(302).location(image.redirect()).cacheControl(CacheControl.noStore()).build();
        }
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePrivate())
                .contentType(MediaType.parseMediaType(image.mime()))
                .body(image.resource());
    }
}
